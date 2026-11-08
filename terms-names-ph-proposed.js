// terms-names-ph-proposed.js  (PROPOSAL, hand-written; not yet in the extension)
// Filipino naming vocabulary to ADD to the name dictionary (given names and surnames), used only as an anchor like terms-names.js.
// Written from general knowledge of Filipino naming practice: diminutives and nicknames, Spanish-derived given names, Muslim / Mindanao (Arabic-
// origin) given names and family names, indigenous and regional (Cordillera, Lumad, Visayan, Ilocano, Kapampangan, Bikol) names, Chinese-Filipino
// (Hokkien-romanized) surnames, and Spanish-catalogue surnames. Vocabulary only: single words, no full name, no individual, no record.
// Words that are also ordinary English or Tagalog words and are not mainly names were left out on purpose. No word was taken from the held-out
// test lists (test-data/names-heldout-filipino*.txt); scripts report the overlap.

const NAMES_PH_FIRST_TEXT = `
bongbong dodoy indang neneng ning boy dindo junjun jayjay pol bebe nonoy noynoy lolit choy beng kiko bogs bobot bimbo bining jingjing ding dingdong
dongdong lito pepe pepito pacing paquito ponching pining pilo poy rody mhelai ayen yoyoy kokoy tintin pepot jeng chinkee lyka jhun jhay jeric jerico
carlo ericka erika antonette antoinette jeanette jovelyn jonalyn jennylyn marilou maricar maricel marites marijoy maryjoy maryann maryjane mariel
marivic marissa marlyn marlon merlita mirasol mylene myrna nelia nenita nerissa nympha odessa pacita precious primo quirino rodel rogelio ronnie
rosalie roselle rosemarie rowena ruel sigfredo simeon teresita tessie tonette tirso urbano vergel vilma violeta wenceslao zoilo zosimo
abdulmajid abdulgani abdulmuin ali alih amir anwar ayesha azizah bashir basher fahima faisal fakhruddin hanifa jaafar jamila kamarudin khadija
kadija mahdi malik mariam maryam mohammad muhammad mohamad nabil nadia naima norodin norjana nurul rabia ramadan rasheed ridwan rohani saeed salma
samira shaira sharifa soraya umar wahab yahya yasir zaid zainudin
aliw amihan apolinario bayani diwata dakila gubat hiraya kayumanggi lualhati luningning malaya marikit sinag tala talina
`;

const NAMES_PH_SURNAMES_TEXT = `
agbayani agoncillo alcala aldaba almario alvarado amistad andaya ansaldo arcega arellano arroyo asuncion avelino ayuson bacani bagatsing balagtas
balmores banzon barcelon bareng basa bayani belarmino benitez briones buenaventura bunag cabral cacho cagampan calderon caluag camacho canlas
capistrano cardenas carino carpio castaneda catalan cerezo clemente concepcion consunji cordero corpuz cuison cunanan dabu dalisay dayrit
dayao ebarle edades elefano encarnacion enriquez espiritu estanislao evangelista fajardo fernandez flores floreza fonacier fortich
frias gabriel gaerlan galang galvez gamboa garchitorena gatdula gatmaitan geronimo gloria guanzon guerrero guillermo gutierrez habito hernando
ibanez ignacio ilustre imperial javier jimenez jison jose labrador lacsamana lagdameo lajara lapuz laurel lazaro legaspi liwanag llamas lopez
lumibao luna mabanta macalino madrigal magalona magat magpantay maglipon magsaysay malabanan malonzo mangahas manguerra mapua marcelo marcos
mariano marquez matias mendiola mercado miranda montalban morales nadal narvaez nepomuceno nieves noble nolasco obispo ocampo oliveros ordonez
ortega osmena padilla pagaduan pagtakhan palma pamintuan panganiban paraiso pardo paredes pascual pastor patricio paz pelayo penaranda perez
pineda planas ponce prieto pulido quezon quijano quimpo quisumbing rabago ramirez ramos recto regalado reyes ricafort rivera rizal robles rodriguez
roque rosales roxas ruiz saldana salvador sandoval sarmiento sebastian segovia serrano sevilleja silverio sison solano sotelo suarez sumulong
tabora tagle tanedo tapang tecson tolentino torralba trinidad trillanes ungson urquiola valdez valencia valera vargas vasquez velasco velez
vergel verzosa vicencio vidal villafuerte villalobos villanueva villar villegas virata vitug yabes yambao zaballa zamora zialcita zulueta
agcaoili bumanglag cacayorin dumayas gaoat tabije lazaga quitevis pacpaco
layug manguiat mangune lacanlale hizon pangilinan dizon lansangan bondoc tablante sicat mallari nacpil
ragragio belen jarabelo lopena nicolas orbigo
hataman jikiri sakalahul kiram misuari adiong dimaampao macadatar pacasum pananganan macabangkit gaurano sampang undug
siy lao gotiong cuaco chiongco tanchiatco yaptangco limgenco uyguangco
baculi calingasan padua mamaril
`;

const NAMES_PH_PROPOSED = {
  firstNames: Array.from(new Set(NAMES_PH_FIRST_TEXT.split(/\s+/).filter(Boolean))),
  surnames: Array.from(new Set(NAMES_PH_SURNAMES_TEXT.split(/\s+/).filter(Boolean)))
};
if (typeof module !== 'undefined' && module.exports) { module.exports = NAMES_PH_PROPOSED; }
if (typeof globalThis !== 'undefined') { globalThis.NAMES_PH_PROPOSED = NAMES_PH_PROPOSED; }
