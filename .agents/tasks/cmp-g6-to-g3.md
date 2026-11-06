## compare-runs: before-group6-rerun.json  ->  after-group3.json

### 1. Clean-row counts
| set | rows | strict clean before | strict clean after | yes loose before | yes loose after | no-rows clean before | no-rows clean after |
|---|---|---|---|---|---|---|---|
| ALL | 161 | 54 | 84 | 55/104 | 57/104 | 24/57 | 30/57 |
| dev C-001..110 + 133,152,153,154,160 | 115 | 33 | 53 | 33/73 | 35/73 | 16/42 | 21/42 |
| hidden (C-111..161 minus the 5) | 46 | 21 | 31 | 22/31 | 22/31 | 8/15 | 9/15 |

### 1b. Strict-span vs lenient clean rows (exact text after normalising case, trailing punctuation, honorifics)
| set | rows | lenient strict-clean before | lenient strict-clean after | exact-span clean before | exact-span clean after | yes rows exact-span clean before | after | non-exact findings hidden by lenient matcher, before | after |
|---|---|---|---|---|---|---|---|---|---|
| ALL | 161 | 54 | 84 | 48 | 79 | 24/104 | 49/104 | 14 | 9 |
| dev | 115 | 33 | 53 | 29 | 50 | 13/73 | 29/73 | 8 | 6 |
| hidden | 46 | 21 | 31 | 19 | 29 | 11/31 | 20/31 | 6 | 3 |

Findings the lenient matcher hides (after run; person names listed, other types counted):
- C-021: "Aling Nena Pascual" (expected: "Nena Pascual")
- C-030: "Maria Santos Branch" (expected: "Maria Santos")
- C-092: "Per Elena Cruz" (expected: "Elena Cruz")
- C-105: "Kapitan Benigno Salonga" (expected: "Benigno Salonga")
other types hidden: {"nlp_job_title":5}

### 2. Total nlp_* findings by type
| type | before | after | delta |
|---|---|---|---|
| nlp_person_name | 182 | 112 | -70 |
| nlp_job_title | 80 | 80 | 0 |
| nlp_organization | 92 | 92 | 0 |
| TOTAL | 354 | 284 | -70 |

### 3. should-not-flag rows that have findings (before -> after)
before: 33 rows, after: 27 rows
| id | split | before | after |
|---|---|---|---|
| C-003 | dev | person_name:"Roberto Villanueva Jr"; organization:"the philippines" | person_name:"Roberto Villanueva Jr"; organization:"the philippines" |
| C-010 | dev | person_name:"Thursday" | - |
| C-012 | dev | person_name:"Emilio Aguinaldo"; person_name:"Andres Bonifacio" | person_name:"Emilio Aguinaldo"; person_name:"Andres Bonifacio" |
| C-013 | dev | person_name:"What" | - |
| C-014 | dev | person_name:"Tell Nathaniel Ocampo" | person_name:"Nathaniel Ocampo" |
| C-019 | dev | person_name:"Someone" | - |
| C-026 | dev | person_name:"Corazon Magsaysay" | person_name:"Corazon Magsaysay" |
| C-040 | dev | person_name:"What"; organization:"best way"; person_name:"Georgia"; person_name:"Victoria"; person_name:"Paris" | organization:"best way"; person_name:"Victoria" |
| C-042 | dev | person_name:"Take Mabini Street"; person_name:"Rizal Avenue"; person_name:"Quezon Boulevard" | - |
| C-050 | dev | person_name:"Which" | - |
| C-051 | dev | job_title:"boss" | job_title:"boss" |
| C-056 | dev | job_title:"pharmacy technician"; organization:"the philippines" | job_title:"pharmacy technician"; organization:"the philippines" |
| C-061 | dev | job_title:"flight attendant"; person_name:"Manila" | job_title:"flight attendant" |
| C-066 | dev | organization:"PhilHealth" | organization:"PhilHealth" |
| C-067 | dev | person_name:"Philippines Diliman"; organization:"University of the Philippines Diliman"; organization:"Tarlac State University" | organization:"University of the Philippines Diliman"; organization:"Tarlac State University" |
| C-070 | dev | person_name:"Amazon"; organization:"Apple"; organization:"Shell" | person_name:"Amazon"; organization:"Apple"; organization:"Shell" |
| C-071 | dev | organization:"Apple"; organization:"Shell" | organization:"Apple"; organization:"Shell" |
| C-072 | dev | organization:"PLDT" | organization:"PLDT" |
| C-077 | dev | organization:"a university" | organization:"a university" |
| C-078 | dev | person_name:"Bangko Sentral"; organization:"Commission on Audit"; organization:"Office of the Ombudsman" | person_name:"Bangko Sentral"; organization:"Commission on Audit"; organization:"Office of the Ombudsman" |
| C-079 | dev | organization:"Microsoft"; organization:"Google"; organization:"the philippines" | organization:"Microsoft"; organization:"Google"; organization:"the philippines" |
| C-080 | dev | person_name:"Philippine Daily Inquirer"; organization:"Philippine Daily Inquirer" | organization:"Philippine Daily Inquirer" |
| C-085 | dev | person_name:"Doctors Without Borders"; person_name:"Philippine National Police"; organization:"Philippine National Police" | organization:"Philippine National Police" |
| C-086 | dev | organization:"Henry Sy Foundation" | organization:"Henry Sy Foundation" |
| C-087 | dev | person_name:"Ayala Lane" | person_name:"Ayala Lane" |
| C-088 | dev | person_name:"Wealth Management"; organization:"Department of Wealth Management" | organization:"Department of Wealth Management" |
| C-117 | hidden | job_title:"nurse"; organization:"St. Luke's Medical Center" | job_title:"nurse"; organization:"St. Luke's Medical Center" |
| C-118 | hidden | person_name:"Mercury Drug"; job_title:"pharmacist"; organization:"Mercury Drug" | job_title:"pharmacist"; organization:"Mercury Drug" |
| C-122 | hidden | person_name:"Philippine General Hospital"; job_title:"radiologic technologist"; organization:"Philippine General Hospital" | job_title:"radiologic technologist"; organization:"Philippine General Hospital" |
| C-123 | hidden | job_title:"customer service representative"; job_title:"call center agent"; organization:"Teleperformance"; organization:"Concentrix" | job_title:"customer service representative"; job_title:"call center agent"; organization:"Teleperformance"; organization:"Concentrix" |
| C-145 | hidden | person_name:"Concepcion" | person_name:"Concepcion" |
| C-146 | hidden | person_name:"Sinigang Na Baboy"; person_name:"Everybody Will Enjoy" | - |
| C-149 | hidden | organization:"to store" | organization:"to store" |

### 4. Rows whose findings changed
| id | split | shouldFlag | status before -> after | added | removed |
|---|---|---|---|---|---|
| C-001 | dev | yes | missing -> missing | - | person_name:"Maria Clara" |
| C-004 | dev | yes | loose-only(extras) -> strict-clean | - | person_name:"Dr" |
| C-006 | dev | yes | missing -> missing | - | person_name:"Section Rizal" |
| C-010 | dev | no | false-positive -> clean | - | person_name:"Thursday" |
| C-013 | dev | no | false-positive -> clean | - | person_name:"What" |
| C-014 | dev | no | false-positive -> false-positive | person_name:"Nathaniel Ocampo" | person_name:"Tell Nathaniel Ocampo" |
| C-019 | dev | no | false-positive -> clean | - | person_name:"Someone" |
| C-025 | dev | yes | loose-only(extras) -> strict-clean | - | person_name:"Hazel" |
| C-028 | dev | yes | loose-only(extras) -> strict-clean | - | person_name:"Mr" |
| C-032 | dev | yes | loose-only(extras) -> strict-clean | - | person_name:"Maria" |
| C-040 | dev | no | false-positive -> false-positive | - | person_name:"What"; person_name:"Georgia"; person_name:"Paris" |
| C-042 | dev | no | false-positive -> clean | - | person_name:"Take Mabini Street"; person_name:"Rizal Avenue"; person_name:"Quezon Boulevard" |
| C-045 | dev | yes | missing -> missing | - | person_name:"Grade" |
| C-050 | dev | no | false-positive -> clean | - | person_name:"Which" |
| C-053 | dev | yes | missing -> missing | - | person_name:"Mr" |
| C-061 | dev | no | false-positive -> false-positive | - | person_name:"Manila" |
| C-062 | dev | yes | missing -> missing | - | person_name:"Capas" |
| C-063 | dev | yes | missing -> strict-clean | person_name:"Karen Tiongson" | person_name:"Thank Nurse Karen" |
| C-067 | dev | no | false-positive -> false-positive | - | person_name:"Philippines Diliman" |
| C-080 | dev | no | false-positive -> false-positive | - | person_name:"Philippine Daily Inquirer" |
| C-081 | dev | yes | missing -> missing | - | person_name:"Philippine Red Cross" |
| C-082 | dev | yes | loose-only(extras) -> strict-clean | - | person_name:"Northgate" |
| C-084 | dev | yes | loose-only(extras) -> strict-clean | - | person_name:"Tarlac National High"; person_name:"Tarlac" |
| C-085 | dev | no | false-positive -> false-positive | - | person_name:"Doctors Without Borders"; person_name:"Philippine National Police" |
| C-088 | dev | no | false-positive -> false-positive | - | person_name:"Wealth Management" |
| C-090 | dev | yes | loose-only(extras) -> strict-clean | - | person_name:"Ayala Land"; person_name:"Ayala" |
| C-091 | dev | yes | loose-only(extras) -> strict-clean | - | person_name:"Globe Telecom"; person_name:"Mark" |
| C-093 | dev | yes | missing -> missing | - | person_name:"Jollibee" |
| C-095 | dev | yes | loose-only(extras) -> strict-clean | - | person_name:"Philippine Airlines" |
| C-096 | dev | yes | loose-only(extras) -> strict-clean | - | person_name:"Santos"; person_name:"Mr" |
| C-098 | dev | yes | loose-only(extras) -> strict-clean | - | person_name:"Philippine Islands"; person_name:"Teresa" |
| C-099 | dev | yes | loose-only(extras) -> strict-clean | - | person_name:"Main Campus" |
| C-101 | dev | yes | loose-only(extras) -> strict-clean | - | person_name:"Ms" |
| C-106 | dev | yes | missing -> strict-clean | person_name:"John Paul Tolentino" | person_name:"Engineer John Paul" |
| C-108 | dev | yes | strict-clean -> strict-clean | person_name:"Eduardo Villareal" | person_name:"Captain Eduardo Villareal" |
| C-110 | dev | yes | missing -> missing | person_name:"Joshua Pangilinan" | person_name:"Introduce Joshua Pangilinan" |
| C-111 | hidden | yes | missing -> missing | - | person_name:"Ms" |
| C-113 | hidden | yes | loose-only(extras) -> strict-clean | - | person_name:"Dr" |
| C-115 | hidden | yes | loose-only(extras) -> strict-clean | - | person_name:"Accenture Philippines" |
| C-118 | hidden | no | false-positive -> false-positive | - | person_name:"Mercury Drug" |
| C-120 | hidden | yes | loose-only(extras) -> strict-clean | - | person_name:"Ayala Land" |
| C-121 | hidden | yes | loose-only(extras) -> strict-clean | - | person_name:"Magsaysay" |
| C-122 | hidden | no | false-positive -> false-positive | - | person_name:"Philippine General Hospital" |
| C-124 | hidden | yes | missing -> missing | - | person_name:"Fire Protection" |
| C-130 | hidden | yes | loose-only(extras) -> strict-clean | - | person_name:"Safety Officer" |
| C-131 | hidden | yes | loose-only(extras) -> strict-clean | - | person_name:"Ayala Land"; person_name:"Mercury Drug" |
| C-132 | hidden | yes | loose-only(extras) -> strict-clean | - | person_name:"Toyota Motor Philippines" |
| C-135 | hidden | yes | missing -> missing | person_name:"Armando Dizon" | person_name:"Principal Armando Dizon"; person_name:"Tarlac National High" |
| C-136 | hidden | yes | loose-only(extras) -> strict-clean | - | person_name:"Maricel" |
| C-137 | hidden | yes | loose-only(extras) -> strict-clean | person_name:"Carla Manuel" | person_name:"Pharmacist Carla Manuel"; person_name:"Mercury Drug" |
| C-146 | hidden | no | false-positive -> clean | - | person_name:"Sinigang Na Baboy"; person_name:"Everybody Will Enjoy" |
| C-152 | dev | yes | missing -> missing | - | person_name:"Philippine General Hospitl"; person_name:"Clearance" |
| C-153 | dev | yes | missing -> missing | - | person_name:"Employment" |
| C-154 | dev | yes | missing -> missing | - | person_name:"Fire Protection"; person_name:"Sentinel" |
| C-155 | hidden | yes | missing -> missing | person_name:"Rosa" | person_name:"Rosa Senior Accountant"; person_name:"Ayala Land"; person_name:"Globe Telecom" |
| C-156 | hidden | yes | missing -> missing | - | person_name:"Tarlac National High"; person_name:"Mr" |
| C-157 | hidden | yes | missing -> missing | - | person_name:"Rizal Street"; person_name:"Philippine Red Cross"; person_name:"Dr" |
| C-159 | hidden | yes | strict-clean -> strict-clean | person_name:"Fernando Manalo" | person_name:"Congratulate Fernando Manalo" |

### 5. Regressions (strict-clean before, not strict-clean after)
none