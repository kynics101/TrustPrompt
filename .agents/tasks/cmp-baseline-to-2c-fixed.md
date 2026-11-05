## compare-runs: baseline.json  ->  after-2c-fixes2.json

### 1. Clean-row counts
| set | rows | strict clean before | strict clean after | yes loose before | yes loose after | no-rows clean before | no-rows clean after |
|---|---|---|---|---|---|---|---|
| ALL | 161 | 38 | 38 | 28/104 | 34/104 | 24/57 | 22/57 |
| dev C-001..110 | 110 | 24 | 25 | 19/68 | 24/68 | 16/42 | 15/42 |
| hidden C-111..161 | 51 | 14 | 13 | 9/36 | 10/36 | 8/15 | 7/15 |

### 2. Total nlp_* findings by type
| type | before | after | delta |
|---|---|---|---|
| nlp_person_name | 183 | 183 | 0 |
| nlp_job_title | 51 | 51 | 0 |
| nlp_organization | 68 | 92 | 24 |
| TOTAL | 302 | 326 | 24 |

### 3. should-not-flag rows that have findings (before -> after)
before: 33 rows, after: 35 rows
| id | split | before | after |
|---|---|---|---|
| C-003 | dev | person_name:"Roberto Villanueva Jr"; organization:"the philippines" | person_name:"Roberto Villanueva Jr"; organization:"the philippines" |
| C-010 | dev | person_name:"Thursday" | person_name:"Thursday" |
| C-012 | dev | person_name:"Emilio Aguinaldo"; person_name:"Andres Bonifacio" | person_name:"Emilio Aguinaldo"; person_name:"Andres Bonifacio" |
| C-013 | dev | person_name:"What"; job_title:"entrepreneurs" | person_name:"What"; job_title:"entrepreneurs" |
| C-014 | dev | person_name:"Tell Nathaniel Ocampo" | person_name:"Tell Nathaniel Ocampo" |
| C-019 | dev | person_name:"Someone" | person_name:"Someone" |
| C-026 | dev | person_name:"Corazon Magsaysay"; job_title:"author"; job_title:"handles" | person_name:"Corazon Magsaysay"; job_title:"author"; job_title:"handles" |
| C-040 | dev | person_name:"What"; organization:"best way"; person_name:"Georgia"; person_name:"Victoria"; person_name:"Paris" | person_name:"What"; organization:"best way"; person_name:"Georgia"; person_name:"Victoria"; person_name:"Paris" |
| C-042 | dev | person_name:"Take Mabini Street"; person_name:"Rizal Avenue"; person_name:"Quezon Boulevard" | person_name:"Take Mabini Street"; person_name:"Rizal Avenue"; person_name:"Quezon Boulevard" |
| C-050 | dev | person_name:"Which" | person_name:"Which" |
| C-051 | dev | job_title:"boss" | job_title:"boss" |
| C-056 | dev | organization:"the philippines" | organization:"the philippines" |
| C-061 | dev | person_name:"Manila" | person_name:"Manila" |
| C-066 | dev | organization:"PhilHealth" | organization:"PhilHealth" |
| C-067 | dev | person_name:"Philippines Diliman"; job_title:"better"; job_title:"master"; organization:"University of the Philippines Diliman"; organization:"University of the Philippines"; organization:"Tarlac State University" | person_name:"Philippines Diliman"; job_title:"better"; job_title:"master"; organization:"University of the Philippines Diliman"; organization:"Tarlac State University" |
| C-070 | dev | person_name:"Amazon"; organization:"Apple"; organization:"Shell" | person_name:"Amazon"; organization:"Apple"; organization:"Shell" |
| C-071 | dev | organization:"Apple"; organization:"Shell" | organization:"Apple"; organization:"Shell" |
| C-072 | dev | organization:"PLDT" | organization:"PLDT" |
| C-073 | dev | job_title:"schedule" | job_title:"schedule" |
| C-077 | dev | organization:"a university" | organization:"a university" |
| C-078 | dev | person_name:"Bangko Sentral"; organization:"Commission on Audit" | person_name:"Bangko Sentral"; organization:"Commission on Audit"; organization:"Office of the Ombudsman" |
| C-079 | dev | organization:"Microsoft"; organization:"Google"; organization:"the philippines" | organization:"Microsoft"; organization:"Google"; organization:"the philippines" |
| C-080 | dev | person_name:"Philippine Daily Inquirer"; organization:"Philippine Daily Inquirer" | person_name:"Philippine Daily Inquirer"; organization:"Philippine Daily Inquirer" |
| C-085 | dev | person_name:"Doctors Without Borders"; person_name:"Philippine National Police"; organization:"Philippine National Police" | person_name:"Doctors Without Borders"; person_name:"Philippine National Police"; organization:"Philippine National Police" |
| C-086 | dev | - | organization:"Henry Sy Foundation" |
| C-087 | dev | person_name:"Ayala Lane" | person_name:"Ayala Lane" |
| C-088 | dev | person_name:"Wealth Management" | person_name:"Wealth Management"; organization:"Department of Wealth Management" |
| C-117 | hidden | - | organization:"St. Luke's Medical Center" |
| C-118 | hidden | person_name:"Mercury Drug"; organization:"Mercury Drug" | person_name:"Mercury Drug"; organization:"Mercury Drug" |
| C-122 | hidden | person_name:"Philippine General Hospital"; job_title:"clearer"; organization:"Philippine General Hospital" | person_name:"Philippine General Hospital"; job_title:"clearer"; organization:"Philippine General Hospital" |
| C-123 | hidden | organization:"Teleperformance"; organization:"Concentrix" | organization:"Teleperformance"; organization:"Concentrix" |
| C-138 | hidden | job_title:"snippet" | job_title:"snippet" |
| C-145 | hidden | person_name:"Concepcion" | person_name:"Concepcion" |
| C-146 | hidden | person_name:"Sinigang Na Baboy"; person_name:"Everybody Will Enjoy" | person_name:"Sinigang Na Baboy"; person_name:"Everybody Will Enjoy" |
| C-149 | hidden | organization:"to store" | organization:"to store" |

### 4. Rows whose findings changed
| id | split | shouldFlag | status before -> after | added | removed |
|---|---|---|---|---|---|
| C-067 | dev | no | false-positive -> false-positive | - | organization:"University of the Philippines" |
| C-068 | dev | yes | missing -> strict-clean | organization:"Lumenbridge Analytics Inc" | - |
| C-069 | dev | yes | missing -> missing | organization:"Santos-Lim Trading Corporation" | - |
| C-078 | dev | no | false-positive -> false-positive | organization:"Office of the Ombudsman" | - |
| C-081 | dev | yes | missing -> missing | - | organization:"Red Cross" |
| C-082 | dev | yes | missing -> loose-only(extras) | organization:"Northgate Logistics Corp"; organization:"Eastwind Packaging Ltd"; organization:"Southpoint Supplies, Inc" | - |
| C-084 | dev | yes | missing -> loose-only(extras) | organization:"Central Luzon State University"; organization:"Tarlac National High School" | - |
| C-086 | dev | no | clean -> false-positive | organization:"Henry Sy Foundation" | - |
| C-088 | dev | no | false-positive -> false-positive | organization:"Department of Wealth Management" | - |
| C-096 | dev | yes | missing -> loose-only(extras) | organization:"Santos-Lim Trading Corporation" | - |
| C-100 | dev | yes | missing -> strict-clean | organization:"Mabuhay Farmers Cooperative" | - |
| C-101 | dev | yes | missing -> missing | organization:"Henry Sy Foundation" | - |
| C-115 | hidden | yes | loose-only(extras) -> loose-only(extras) | - | organization:"Accenture" |
| C-117 | hidden | no | clean -> false-positive | organization:"St. Luke's Medical Center" | - |
| C-120 | hidden | yes | missing -> missing | organization:"SGV & Co" | - |
| C-121 | hidden | yes | missing -> missing | organization:"Magsaysay Maritime Corporation" | - |
| C-124 | hidden | yes | missing -> missing | organization:"Bureau of Fire Protection" | - |
| C-125 | hidden | yes | missing -> missing | organization:"Pacific Harvest Foods Inc" | - |
| C-126 | hidden | yes | missing -> missing | organization:"St. Luke's Medical Center" | - |
| C-127 | hidden | yes | missing -> missing | organization:"Megawide Construction Corporation" | organization:"Megawide Construction" |
| C-130 | hidden | yes | missing -> missing | organization:"Mabuhay Steelworks Inc" | - |
| C-132 | hidden | yes | missing -> missing | - | organization:"Toyota" |
| C-135 | hidden | yes | missing -> missing | organization:"Tarlac National High School" | - |
| C-136 | hidden | yes | missing -> missing | organization:"Cebu Pacific" | - |
| C-137 | hidden | yes | missing -> loose-only(extras) | organization:"Philippine Pharmacists Association" | - |
| C-151 | hidden | yes | missing -> missing | - | organization:"the philippines" |
| C-153 | hidden | yes | missing -> missing | organization:"St. Luke's Medical Center" | - |
| C-154 | hidden | yes | missing -> missing | organization:"Pacific Harvest Foods Inc"; organization:"Bureau of Fire Protection" | - |
| C-155 | hidden | yes | missing -> missing | organization:"SGV & Co" | - |
| C-156 | hidden | yes | missing -> missing | organization:"Parents-Teachers Association"; organization:"Tarlac National High School" | - |
| C-157 | hidden | yes | missing -> missing | organization:"Tarlac Provincial Hospital" | organization:"Red Cross" |

### 5. Regressions (strict-clean before, not strict-clean after)
C-086, C-117