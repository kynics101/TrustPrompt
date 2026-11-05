## compare-runs: after-2c-fixes2.json  ->  after-group5b.json

### 1. Clean-row counts
| set | rows | strict clean before | strict clean after | yes loose before | yes loose after | no-rows clean before | no-rows clean after |
|---|---|---|---|---|---|---|---|
| ALL | 161 | 38 | 49 | 34/104 | 54/104 | 22/57 | 22/57 |
| dev C-001..110 | 110 | 25 | 28 | 24/68 | 31/68 | 15/42 | 14/42 |
| hidden C-111..161 | 51 | 13 | 21 | 10/36 | 23/36 | 7/15 | 8/15 |

### 2. Total nlp_* findings by type
| type | before | after | delta |
|---|---|---|---|
| nlp_person_name | 183 | 182 | -1 |
| nlp_job_title | 51 | 90 | 39 |
| nlp_organization | 92 | 92 | 0 |
| TOTAL | 326 | 364 | 38 |

### 3. should-not-flag rows that have findings (before -> after)
before: 35 rows, after: 35 rows
| id | split | before | after |
|---|---|---|---|
| C-003 | dev | person_name:"Roberto Villanueva Jr"; organization:"the philippines" | person_name:"Roberto Villanueva Jr"; organization:"the philippines" |
| C-010 | dev | person_name:"Thursday" | person_name:"Thursday" |
| C-012 | dev | person_name:"Emilio Aguinaldo"; person_name:"Andres Bonifacio" | person_name:"Emilio Aguinaldo"; person_name:"Andres Bonifacio" |
| C-013 | dev | person_name:"What"; job_title:"entrepreneurs" | person_name:"What" |
| C-014 | dev | person_name:"Tell Nathaniel Ocampo" | person_name:"Tell Nathaniel Ocampo" |
| C-019 | dev | person_name:"Someone" | person_name:"Someone" |
| C-026 | dev | person_name:"Corazon Magsaysay"; job_title:"author"; job_title:"handles" | person_name:"Corazon Magsaysay" |
| C-040 | dev | person_name:"What"; organization:"best way"; person_name:"Georgia"; person_name:"Victoria"; person_name:"Paris" | person_name:"What"; organization:"best way"; person_name:"Georgia"; person_name:"Victoria"; person_name:"Paris" |
| C-042 | dev | person_name:"Take Mabini Street"; person_name:"Rizal Avenue"; person_name:"Quezon Boulevard" | person_name:"Take Mabini Street"; person_name:"Rizal Avenue"; person_name:"Quezon Boulevard" |
| C-050 | dev | person_name:"Which" | person_name:"Which" |
| C-051 | dev | job_title:"boss" | job_title:"boss" |
| C-056 | dev | organization:"the philippines" | job_title:"pharmacy technician"; organization:"the philippines" |
| C-061 | dev | person_name:"Manila" | job_title:"flight attendant"; person_name:"Manila" |
| C-066 | dev | organization:"PhilHealth" | organization:"PhilHealth" |
| C-067 | dev | person_name:"Philippines Diliman"; job_title:"better"; job_title:"master"; organization:"University of the Philippines Diliman"; organization:"Tarlac State University" | person_name:"Philippines Diliman"; job_title:"master"; organization:"University of the Philippines Diliman"; organization:"Tarlac State University" |
| C-070 | dev | person_name:"Amazon"; organization:"Apple"; organization:"Shell" | person_name:"Amazon"; organization:"Apple"; organization:"Shell" |
| C-071 | dev | organization:"Apple"; organization:"Shell" | organization:"Apple"; organization:"Shell" |
| C-072 | dev | organization:"PLDT" | organization:"PLDT" |
| C-073 | dev | job_title:"schedule" | job_title:"schedule" |
| C-076 | dev | - | job_title:"department head" |
| C-077 | dev | organization:"a university" | organization:"a university" |
| C-078 | dev | person_name:"Bangko Sentral"; organization:"Commission on Audit"; organization:"Office of the Ombudsman" | person_name:"Bangko Sentral"; organization:"Commission on Audit"; organization:"Office of the Ombudsman" |
| C-079 | dev | organization:"Microsoft"; organization:"Google"; organization:"the philippines" | organization:"Microsoft"; organization:"Google"; organization:"the philippines" |
| C-080 | dev | person_name:"Philippine Daily Inquirer"; organization:"Philippine Daily Inquirer" | person_name:"Philippine Daily Inquirer"; organization:"Philippine Daily Inquirer" |
| C-085 | dev | person_name:"Doctors Without Borders"; person_name:"Philippine National Police"; organization:"Philippine National Police" | person_name:"Doctors Without Borders"; person_name:"Philippine National Police"; organization:"Philippine National Police" |
| C-086 | dev | organization:"Henry Sy Foundation" | organization:"Henry Sy Foundation" |
| C-087 | dev | person_name:"Ayala Lane" | person_name:"Ayala Lane" |
| C-088 | dev | person_name:"Wealth Management"; organization:"Department of Wealth Management" | person_name:"Wealth Management"; organization:"Department of Wealth Management" |
| C-117 | hidden | organization:"St. Luke's Medical Center" | job_title:"nurse"; organization:"St. Luke's Medical Center" |
| C-118 | hidden | person_name:"Mercury Drug"; organization:"Mercury Drug" | person_name:"Mercury Drug"; job_title:"pharmacist"; organization:"Mercury Drug" |
| C-122 | hidden | person_name:"Philippine General Hospital"; job_title:"clearer"; organization:"Philippine General Hospital" | person_name:"Philippine General Hospital"; job_title:"radiologic technologist"; organization:"Philippine General Hospital" |
| C-123 | hidden | organization:"Teleperformance"; organization:"Concentrix" | job_title:"customer service representative"; job_title:"call center agent"; organization:"Teleperformance"; organization:"Concentrix" |
| C-138 | hidden | job_title:"snippet" | - |
| C-145 | hidden | person_name:"Concepcion" | person_name:"Concepcion" |
| C-146 | hidden | person_name:"Sinigang Na Baboy"; person_name:"Everybody Will Enjoy" | person_name:"Sinigang Na Baboy"; person_name:"Everybody Will Enjoy"; job_title:"cook" |
| C-149 | hidden | organization:"to store" | organization:"to store" |

### 4. Rows whose findings changed
| id | split | shouldFlag | status before -> after | added | removed |
|---|---|---|---|---|---|
| C-013 | dev | no | false-positive -> false-positive | - | job_title:"entrepreneurs" |
| C-026 | dev | no | false-positive -> false-positive | - | job_title:"author"; job_title:"handles" |
| C-029 | dev | yes | missing -> missing | - | job_title:"prepare" |
| C-044 | dev | yes | missing -> strict-clean | job_title:"jeepney driver" | job_title:"driver" |
| C-048 | dev | yes | missing -> strict-clean | job_title:"seaman" | job_title:"agent" |
| C-049 | dev | yes | missing -> loose-only(extras) | job_title:"chief financial officer"; job_title:"certified public accountant" | job_title:"accountant" |
| C-054 | dev | yes | missing -> missing | job_title:"freelance graphic designer" | job_title:"graphic designer"; job_title:"designer" |
| C-055 | dev | yes | missing -> missing | job_title:"tricycle driver"; job_title:"online seller"; job_title:"owner" | job_title:"driver"; job_title:"seller" |
| C-056 | dev | no | false-positive -> false-positive | job_title:"pharmacy technician" | - |
| C-058 | dev | yes | missing -> missing | job_title:"security guard"; job_title:"utility worker" | - |
| C-061 | dev | no | false-positive -> false-positive | job_title:"flight attendant" | - |
| C-063 | dev | yes | missing -> missing | job_title:"surgeon"; job_title:"nurse" | - |
| C-067 | dev | no | false-positive -> false-positive | - | job_title:"better" |
| C-076 | dev | no | clean -> false-positive | job_title:"department head" | - |
| C-095 | dev | yes | loose-only(extras) -> loose-only(extras) | - | job_title:"letter" |
| C-101 | dev | yes | missing -> loose-only(extras) | job_title:"director" | - |
| C-102 | dev | yes | missing -> strict-clean | job_title:"cardiologist" | - |
| C-103 | dev | yes | missing -> strict-clean | job_title:"tricycle driver" | job_title:"driver" |
| C-106 | dev | yes | missing -> missing | job_title:"engineer" | - |
| C-107 | dev | yes | missing -> loose-only(extras) | job_title:"part-time call center agent" | - |
| C-108 | dev | yes | missing -> missing | job_title:"captain" | - |
| C-110 | dev | yes | missing -> missing | job_title:"graphic designer" | - |
| C-111 | hidden | yes | loose-only(extras) -> missing | - | job_title:"principal"; job_title:"former" |
| C-114 | hidden | yes | missing -> strict-clean | job_title:"mason" | person_name:"Mason" |
| C-115 | hidden | yes | loose-only(extras) -> loose-only(extras) | - | job_title:"engineer" |
| C-116 | hidden | yes | missing -> strict-clean | job_title:"teacher" | - |
| C-117 | hidden | no | false-positive -> false-positive | job_title:"nurse" | - |
| C-118 | hidden | no | false-positive -> false-positive | job_title:"pharmacist" | - |
| C-119 | hidden | yes | missing -> missing | - | job_title:"guard" |
| C-120 | hidden | yes | missing -> loose-only(extras) | job_title:"accountant"; job_title:"auditor" | - |
| C-121 | hidden | yes | missing -> loose-only(extras) | job_title:"OFW seaman" | - |
| C-122 | hidden | no | false-positive -> false-positive | job_title:"radiologic technologist" | job_title:"clearer" |
| C-123 | hidden | no | false-positive -> false-positive | job_title:"customer service representative"; job_title:"call center agent" | - |
| C-124 | hidden | yes | missing -> missing | job_title:"Protection's fire marshal" | - |
| C-125 | hidden | yes | missing -> strict-clean | job_title:"warehouse supervisor" | - |
| C-126 | hidden | yes | missing -> strict-clean | job_title:"registered nurse" | - |
| C-127 | hidden | yes | missing -> strict-clean | job_title:"senior civil engineer" | - |
| C-128 | hidden | yes | missing -> missing | job_title:"partner" | - |
| C-129 | hidden | yes | missing -> strict-clean | job_title:"professor" | - |
| C-130 | hidden | yes | missing -> loose-only(extras) | job_title:"Safety Officer"; job_title:"welder" | - |
| C-131 | hidden | yes | missing -> loose-only(extras) | job_title:"electrician"; job_title:"accountant"; job_title:"pharmacist" | - |
| C-132 | hidden | yes | missing -> loose-only(extras) | job_title:"mechanic" | - |
| C-133 | hidden | yes | missing -> missing | job_title:"call center agent" | job_title:"schedule"; job_title:"leader" |
| C-134 | hidden | yes | missing -> strict-clean | job_title:"chief financial officer" | - |
| C-135 | hidden | yes | missing -> missing | job_title:"principal"; job_title:"teacher"; job_title:"nurse" | - |
| C-136 | hidden | yes | missing -> loose-only(extras) | job_title:"flight attendant" | - |
| C-138 | hidden | no | false-positive -> clean | - | job_title:"snippet" |
| C-146 | hidden | no | false-positive -> false-positive | job_title:"cook" | - |
| C-151 | hidden | yes | missing -> strict-clean | job_title:"research assistant" | job_title:"stronger" |
| C-152 | hidden | yes | missing -> missing | job_title:"technologist" | job_title:"patholgist" |
| C-153 | hidden | yes | missing -> missing | job_title:"department head"; job_title:"pulmonologist"; job_title:"registered nurse" | job_title:"nurse" |
| C-154 | hidden | yes | missing -> missing | job_title:"warehouse supervisor"; job_title:"security guard"; job_title:"electrician"; job_title:"breaker" | - |
| C-155 | hidden | yes | missing -> missing | job_title:"Senior Accountant"; job_title:"audit associate"; job_title:"cpa" | job_title:"former" |
| C-156 | hidden | yes | missing -> missing | job_title:"district supervisor"; job_title:"public school teacher" | job_title:"principal"; job_title:"teacher" |
| C-157 | hidden | yes | missing -> missing | job_title:"family physician" | - |
| C-158 | hidden | yes | strict-clean -> strict-clean | job_title:"thesis adviser" | job_title:"adviser" |
| C-160 | hidden | yes | strict-clean -> loose-only(extras) | job_title:"team leader" | - |

### 5. Regressions (strict-clean before, not strict-clean after)
C-076, C-160