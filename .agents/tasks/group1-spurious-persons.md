# Group 1 step 1: spurious nlp_person_name findings in after-group6.json

Method = extractionMethod of the finding (M1 honorific, M2 trigger phrase, M3 subject position, M4 standalone capitalised, M4.5 directive context). "org evidence" = an nlp_organization finding in the same row contains / equals the text.

## Organizations (whole org tagged as person): 19

| row | flag | method | text | org evidence in row |
|---|---|---|---|---|
| C-070 | no | M3 | Amazon |  |
| C-080 | no | M4 | Philippine Daily Inquirer | ORGFIND="Philippine Daily Inquirer" |
| C-081 | yes | M3 | Philippine Red Cross | ORGFIND="Philippine Red Cross" |
| C-085 | no | M4 | Doctors Without Borders |  |
| C-085 | no | M4 | Philippine National Police | ORGFIND="Philippine National Police" |
| C-090 | yes | M4 | Ayala Land | ORGFIND="Ayala Land" |
| C-091 | yes | M4 | Globe Telecom | ORGFIND="Globe Telecom" |
| C-095 | yes | M4 | Philippine Airlines | ORGFIND="Philippine Airlines" |
| C-115 | yes | M4 | Accenture Philippines | ORGFIND="Accenture Philippines" |
| C-118 | no | M4 | Mercury Drug | ORGFIND="Mercury Drug" |
| C-120 | yes | M4 | Ayala Land | ORGFIND="Ayala Land" |
| C-122 | no | M3 | Philippine General Hospital | ORGFIND="Philippine General Hospital" |
| C-131 | yes | M4 | Ayala Land | ORGFIND="Ayala Land" |
| C-131 | yes | M4 | Mercury Drug | ORGFIND="Mercury Drug" |
| C-132 | yes | M4 | Toyota Motor Philippines | ORGFIND="Toyota Motor Philippines" |
| C-137 | yes | M4 | Mercury Drug | ORGFIND="Mercury Drug" |
| C-155 | yes | M4 | Ayala Land | ORGFIND="Ayala Land" |
| C-155 | yes | M4 | Globe Telecom | ORGFIND="Globe Telecom" |
| C-157 | yes | M4 | Philippine Red Cross | ORGFIND="Philippine Red Cross" |

## Organizations (fragment of an org): 18

| row | flag | method | text | org evidence in row |
|---|---|---|---|---|
| C-067 | no | M4 | Philippines Diliman | ORGFIND="University of the Philippines Diliman" |
| C-078 | no | M4 | Bangko Sentral |  |
| C-082 | yes | M4.5 | Northgate | ORGFIND="Northgate Logistics Corp" |
| C-084 | yes | M4 | Tarlac National High | ORGFIND="Tarlac National High School" |
| C-084 | yes | M4.5 | Tarlac | ORGFIND="Tarlac National High School" |
| C-088 | no | M4 | Wealth Management | ORGFIND="Department of Wealth Management" |
| C-090 | yes | M4.5 | Ayala | ORGFIND="Ayala Land" |
| C-093 | yes | M4.5 | Jollibee | ORGFIND="Jollibee Foods Corporation" |
| C-096 | yes | M4.5 | Santos | ORGFIND="Santos-Lim Trading Corporation" |
| C-098 | yes | M4 | Philippine Islands | ORGFIND="Bank of the Philippine Islands" |
| C-121 | yes | M4.5 | Magsaysay | ORGFIND="Magsaysay Maritime Corporation" |
| C-124 | yes | M4 | Fire Protection | ORGFIND="Bureau of Fire Protection" |
| C-135 | yes | M4 | Tarlac National High | ORGFIND="Tarlac National High School" |
| C-152 | yes | M4 | Philippine General Hospitl | ORGFIND="philippine general hospitl" |
| C-154 | yes | M4 | Sentinel Shield Security |  |
| C-154 | yes | M4 | Fire Protection | ORGFIND="Bureau of Fire Protection" |
| C-154 | yes | M4.5 | Sentinel |  |
| C-156 | yes | M4 | Tarlac National High | ORGFIND="Tarlac National High School" |

## Places / streets / campus: 11

| row | flag | method | text | org evidence in row |
|---|---|---|---|---|
| C-040 | no | M4.5 | Georgia |  |
| C-040 | no | M4.5 | Victoria |  |
| C-040 | no | M4.5 | Paris |  |
| C-042 | no | M4 | Take Mabini Street |  |
| C-042 | no | M4 | Rizal Avenue |  |
| C-042 | no | M4 | Quezon Boulevard |  |
| C-061 | no | M4.5 | Manila |  |
| C-062 | yes | M4.5 | Capas |  |
| C-087 | no | M4 | Ayala Lane |  |
| C-099 | yes | M4 | Main Campus |  |
| C-157 | yes | M4 | Rizal Street |  |

## Titles, honorifics, leading verbs (Group 3): 14

| row | flag | method | text | org evidence in row |
|---|---|---|---|---|
| C-004 | yes | M4.5 | Dr |  |
| C-014 | no | M4 | Tell Nathaniel Ocampo |  |
| C-028 | yes | M4.5 | Mr |  |
| C-053 | yes | M4.5 | Mr |  |
| C-063 | yes | M4 | Thank Nurse Karen |  |
| C-096 | yes | M4.5 | Mr |  |
| C-101 | yes | M4.5 | Ms |  |
| C-106 | yes | M4 | Engineer John Paul |  |
| C-111 | yes | M4.5 | Ms |  |
| C-113 | yes | M4.5 | Dr |  |
| C-130 | yes | M4 | Safety Officer |  |
| C-155 | yes | M4 | Rosa Senior Accountant |  |
| C-156 | yes | M4.5 | Mr |  |
| C-157 | yes | M4.5 | Dr |  |

## Ordinary words: 10

| row | flag | method | text | org evidence in row |
|---|---|---|---|---|
| C-010 | no | M4.5 | Thursday |  |
| C-013 | no | M3 | What |  |
| C-019 | no | M3 | Someone |  |
| C-040 | no | M3 | What |  |
| C-045 | yes | M4.5 | Grade |  |
| C-050 | no | M3 | Which |  |
| C-146 | no | M4 | Sinigang Na Baboy |  |
| C-146 | no | M4 | Everybody Will Enjoy |  |
| C-152 | yes | M4.5 | Clearance |  |
| C-153 | yes | M4.5 | Employment |  |

## Other (partial/truncated names = Groups 3/4; public-figure names on policy rows): 28

| row | flag | method | text | org evidence in row |
|---|---|---|---|---|
| C-001 | yes | M2 | Maria Clara |  |
| C-002 | yes | M4.5 | Juan |  |
| C-003 | no | M4 | Roberto Villanueva Jr |  |
| C-005 | yes | M4 | Angelica Reyes |  |
| C-006 | yes | M4 | Kristine Joy |  |
| C-006 | yes | M4 | Section Rizal |  |
| C-009 | yes | M4 | Cristina Pe |  |
| C-009 | yes | M4.5 | Ma |  |
| C-012 | no | M4 | Emilio Aguinaldo |  |
| C-012 | no | M4 | Andres Bonifacio |  |
| C-017 | yes | M4 | Ferdinand Miguel Alcantara |  |
| C-018 | yes | M4 | Lorna Lacson |  |
| C-024 | yes | M4 | Fatima Al |  |
| C-025 | yes | M4.5 | Hazel |  |
| C-026 | no | M4 | Corazon Magsaysay |  |
| C-032 | yes | M4.5 | Maria |  |
| C-034 | yes | M1 | Santos |  |
| C-034 | yes | M3 | Maria |  |
| C-036 | yes | M4 | Maria Cristina Esperanza |  |
| C-036 | yes | M4 | Dela Paz |  |
| C-091 | yes | M4.5 | Mark |  |
| C-098 | yes | M4.5 | Teresa |  |
| C-128 | yes | M4 | Salazar Hernandez |  |
| C-135 | yes | M4 | Grace Dela Pe |  |
| C-136 | yes | M4.5 | Maricel |  |
| C-145 | no | M3 | Concepcion |  |
| C-155 | yes | M4 | Alvin Jay Dela |  |
| C-156 | yes | M1 | Dizon |  |

