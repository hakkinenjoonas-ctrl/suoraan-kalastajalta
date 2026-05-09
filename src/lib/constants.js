export const fishSpeciesCatalog = [
  { name_fi: "Kuha", name_en: "Zander", scientific: "Sander lucioperca", fao: "FPP" },
  { name_fi: "Ahven", name_en: "European perch", scientific: "Perca fluviatilis", fao: "FPE" },
  { name_fi: "Hauki", name_en: "Pike", scientific: "Esox lucius", fao: "FPI" },
  { name_fi: "Lahna", name_en: "Freshwater bream", scientific: "Abramis brama", fao: "FBM" },
  { name_fi: "Särki", name_en: "Roach", scientific: "Rutilus rutilus", fao: "FRO" },
  { name_fi: "Muikku", name_en: "Vendace", scientific: "Coregonus albula", fao: "FVE" },
  { name_fi: "Siika", name_en: "Whitefish", scientific: "Coregonus lavaretus", fao: "WHF" },
  { name_fi: "Made", name_en: "Burbot", scientific: "Lota lota", fao: "FBU" },
  { name_fi: "Säyne", name_en: "Ide", scientific: "Leuciscus idus", fao: "FID" },
  { name_fi: "Kiiski", name_en: "Ruffe", scientific: "Gymnocephalus cernua", fao: "FRF" },
  { name_fi: "Kuore", name_en: "Smelt", scientific: "Osmerus eperlanus", fao: "SME" },
  { name_fi: "Silakka", name_en: "Baltic herring", scientific: "Clupea harengus", fao: "HER" },
  { name_fi: "Kilohaili", name_en: "Sprat", scientific: "Sprattus sprattus", fao: "SPR" },
  { name_fi: "Lohi", name_en: "Atlantic salmon", scientific: "Salmo salar", fao: "SAL" },
  { name_fi: "Kirjolohi", name_en: "Rainbow trout", scientific: "Oncorhynchus mykiss", fao: "TRR" },
  { name_fi: "Taimen", name_en: "Brown trout", scientific: "Salmo trutta", fao: "TRU" },
  { name_fi: "Ankerias", name_en: "Eel", scientific: "Anguilla anguilla", fao: "ELE" },
  { name_fi: "Toutain", name_en: "Asp", scientific: "Aspius aspius", fao: "ASU" },
  { name_fi: "Suutari", name_en: "Tench", scientific: "Tinca tinca", fao: "FTE" },
  { name_fi: "Kampela", name_en: "Flounder", scientific: "Platichthys flesus", fao: "FLE" },
  { name_fi: "Täplärapu", name_en: "Signal crayfish", scientific: "Pacifastacus leniusculus", fao: "PCL" },
  { name_fi: "Jokirapu", name_en: "Noble crayfish", scientific: "Astacus astacus", fao: "AAS" },
];

export const fishSpeciesVariants = [
  "Muikku, perattu",
  "Muikku, perattu päätön",
  "Kuha, avattu",
  "Kuha filee",
  "Ahven, avattu",
  "Ahven filee",
  "Hauki, avattu",
  "Hauki filee",
  "Made, nyljetty",
  "Kirjolohi filee",
  "Lohi filee",
  "Siika filee",
  "Taimen filee",
  "Täplärapu 10+ cm",
  "Täplärapu 11+ cm",
  "Täplärapu 12+ cm",
  "Jokirapu 10+ cm",
  "Jokirapu 11+ cm",
  "Jokirapu 12+ cm",
];

export const fishSpeciesByName = Object.fromEntries(
  fishSpeciesCatalog.map((item) => [item.name_fi.toLowerCase(), item])
);

export const fishSpecies = [
  ...fishSpeciesCatalog
    .map((item) => item.name_fi)
    .filter((name) => name !== "Täplärapu" && name !== "Jokirapu"),
  ...fishSpeciesVariants,
  "Muu",
];
export const gearTypes = [
  "Trooli",
  "Nuotta, korkeus yli 10 m",
  "Nuotta, korkeus alle 10 m",
  "Muikkuverkko",
  "Verkko, solmuväli alle 25 mm",
  "Verkko, solmuväli 25 - 40 mm",
  "Verkko, solmuväli 41 - 54 mm",
  "Verkko, solmuväli yli 54 mm",
  "Rysä / paunetti, korkeus yli 1,5 m",
  "Rysä / paunetti, korkeus alle 1,5 m",
  "Katiska",
  "Merta",
  "Muu pyydys",
  "Hoitokalastus troolilla",
  "Hoitokalastus nuotalla",
  "Hoitokalastus rysällä, paunetilla, merralla ja katiskalla",
  "Hoitokalastus muulla pyydyksellä",
  "Vapapyydys tai vetouistin",
];
export const CATCH_FORM_DEFAULTS_KEY = "catch_form_defaults_v1";
export const ONBOARDING_GUIDE_MAX_VIEWS = 3;
export const ONBOARDING_GUIDE_STORAGE_PREFIX = "onboarding_guide_v1";
export const CUSTOM_LAKE_AREA_OPTION = "__custom_lake_area__";
export const CUSTOM_SEA_AREA_OPTION = "__custom_sea_area__";
export const DELIVERY_COMPETITION_AVAILABLE = false;
export const deliveryMethods = ["Nouto", "Myyjä toimittaa", "Kuljetus järjestetään", "Sovitaan erikseen"];
export const transportModeLabels = {
  terminal: "Vie terminaaliin",
  pickup: "Kuljetusfirma noutaa",
  collection_point: "Vie keräilypisteeseen",
};
export const processedProductTypes = ["Filee", "Graavi", "Kylmäsavu", "Lämminsavu", "Mäti", "Massa", "Pyörykät", "Pihvit", "Muu"];
export const processingMethods = ["Fileointi", "Graavaus", "Kylmäsavustus", "Lämminsavustus", "Pakastaminen", "Jauhatus", "Kypsennys", "Muu"];
export const COMMISSION_RATE = 0.03;
export const PUSH_CHANNEL_ID = "trade_events_waterdrop_converted_v6";
export const PUSH_SOUND_NAME = "waterdrop_converted";
export const finlandMunicipalities = [
  "Akaa", "Alajärvi", "Alavieska", "Alavus", "Asikkala", "Askola", "Aura", "Brändö", "Eckerö", "Enonkoski",
  "Enontekiö", "Espoo", "Eura", "Eurajoki", "Evijärvi", "Finström", "Forssa", "Föglö", "Geta", "Haapajärvi",
  "Haapavesi", "Hailuoto", "Halsua", "Hamina", "Hammarland", "Hankasalmi", "Hanko", "Harjavalta", "Hartola", "Hattula",
  "Hausjärvi", "Heinola", "Heinävesi", "Helsinki", "Hirvensalmi", "Hollola", "Huittinen", "Humppila", "Hyrynsalmi", "Hyvinkää",
  "Hämeenkyrö", "Hämeenlinna", "Ii", "Iisalmi", "Iitti", "Ikaalinen", "Ilmajoki", "Ilomantsi", "Imatra", "Inari",
  "Inkoo", "Isojoki", "Isokyrö", "Janakkala", "Joensuu", "Jokioinen", "Jomala", "Joroinen", "Joutsa", "Juuka",
  "Juupajoki", "Juva", "Jyväskylä", "Jämijärvi", "Jämsä", "Järvenpää", "Kaarina", "Kaavi", "Kajaani", "Kalajoki",
  "Kangasala", "Kangasniemi", "Kankaanpää", "Kannonkoski", "Kannus", "Karijoki", "Karkkila", "Karstula", "Karvia", "Kaskinen",
  "Kauhajoki", "Kauhava", "Kauniainen", "Kaustinen", "Keitele", "Kemi", "Kemijärvi", "Keminmaa", "Kimitoön", "Kinnula",
  "Kirkkonummi", "Kitee", "Kittilä", "Kiuruvesi", "Kivijärvi", "Kokemäki", "Kokkola", "Kolari", "Konnevesi", "Kontiolahti",
  "Korsnäs", "Koski Tl", "Kotka", "Kouvola", "Kristiinankaupunki", "Kruunupyy", "Kuhmo", "Kuhmoinen", "Kumlinge", "Kuopio",
  "Kuortane", "Kurikka", "Kustavi", "Kuusamo", "Kyyjärvi", "Kärkölä", "Kärsämäki", "Kökar", "Lahti", "Laihia",
  "Laitila", "Lapinjärvi", "Lapinlahti", "Lappajärvi", "Lappeenranta", "Lapua", "Laukaa", "Lemi", "Lemland", "Lempäälä",
  "Leppävirta", "Lestijärvi", "Lieksa", "Lieto", "Liminka", "Liperi", "Lohja", "Loimaa", "Loppi", "Loviisa",
  "Luhanka", "Lumijoki", "Lumparland", "Luoto", "Luumäki", "Maalahti", "Maarianhamina", "Marttila", "Masku", "Merijärvi",
  "Merikarvia", "Miehikkälä", "Mikkeli", "Muhos", "Multia", "Muonio", "Mustasaari", "Muurame", "Mynämäki", "Myrskylä",
  "Mäntsälä", "Mänttä-Vilppula", "Mäntyharju", "Naantali", "Nakkila", "Nivala", "Nokia", "Nousiainen", "Nurmes", "Nurmijärvi",
  "Närpiö", "Orimattila", "Oripää", "Orivesi", "Oulainen", "Oulu", "Outokumpu", "Padasjoki", "Paimio", "Paltamo",
  "Parainen", "Parikkala", "Parkano", "Pedersören kunta", "Pelkosenniemi", "Pello", "Perho", "Pertunmaa", "Petäjävesi", "Pieksämäki",
  "Pielavesi", "Pietarsaari", "Pihtipudas", "Pirkkala", "Polvijärvi", "Pomarkku", "Pori", "Pornainen", "Porvoo", "Posio",
  "Pudasjärvi", "Pukkila", "Punkalaidun", "Puolanka", "Puumala", "Pyhtää", "Pyhäjoki", "Pyhäjärvi", "Pyhäntä", "Pyhäranta",
  "Pälkäne", "Pöytyä", "Raahe", "Raasepori", "Raisio", "Rantasalmi", "Ranua", "Rauma", "Rautalampi", "Rautavaara",
  "Rautjärvi", "Reisjärvi", "Riihimäki", "Ristijärvi", "Rovaniemi", "Ruokolahti", "Ruovesi", "Rusko", "Rääkkylä", "Saarijärvi",
  "Salla", "Salo", "Saltvik", "Sastamala", "Sauvo", "Savitaipale", "Savonlinna", "Savukoski", "Seinäjoki", "Sievi",
  "Siikainen", "Siikajoki", "Siikalatva", "Siilinjärvi", "Simo", "Sipoo", "Siuntio", "Sodankylä", "Soini", "Somero",
  "Sonkajärvi", "Sotkamo", "Sottunga", "Sulkava", "Sund", "Suomussalmi", "Suonenjoki", "Sysmä", "Säkylä", "Taipalsaari",
  "Taivalkoski", "Taivassalo", "Tammela", "Tampere", "Tervo", "Tervola", "Teuva", "Tohmajärvi", "Toholampi", "Toivakka",
  "Tornio", "Turku", "Tuusniemi", "Tuusula", "Tyrnävä", "Ulvila", "Urjala", "Utajärvi", "Utsjoki", "Uurainen",
  "Uusikaarlepyy", "Uusikaupunki", "Vaala", "Vaasa", "Valkeakoski", "Vantaa", "Varkaus", "Vehmaa", "Vesanto", "Vesilahti",
  "Veteli", "Vieremä", "Vihti", "Viitasaari", "Vimpeli", "Virolahti", "Virrat", "Vårdö", "Vöyri", "Ylitornio",
  "Ylivieska", "Ylöjärvi", "Ypäjä", "Ähtäri", "Äänekoski",
];

export const defaultAreas = [
  "Saimaa",
  "Suur-Saimaa",
  "Pien-Saimaa",
  "Puruvesi",
  "Haukivesi",
  "Pihlajavesi",
  "Orivesi (Saimaa)",
  "Pyhäselkä",
  "Enonvesi",
  "Lietvesi",
  "Luonteri",
  "Yövesi",
  "Kallavesi",
  "Unnukka",
  "Suvasvesi",
  "Onkivesi",
  "Porovesi",
  "Iisvesi",
  "Nilakka",
  "Keitele",
  "Konnevesi",
  "Päijänne",
  "Puula",
  "Jääsjärvi",
  "Vesijärvi (Lahti)",
  "Näsijärvi",
  "Pyhäjärvi",
  "Pyhäjärvi (Tampere)",
  "Vanajavesi",
  "Kyrösjärvi",
  "Lappajärvi",
  "Oulujärvi",
  "Inari",
  "Kemijärvi",
  "Lokka",
  "Porttipahta",
  "Suomenlahti",
  "Saaristomeri",
  "Selkämeri",
  "Perämeri",
  "Ahvenanmeri",
  "Muu järvi",
  "Merialue (muu)",
];

export const alwaysSuggestedDestinationCities = ["Helsinki", "Vantaa", "Espoo"];
export const logisticsRegionCities = {
  south: ["Helsinki", "Espoo", "Vantaa", "Lahti", "Porvoo", "Turku", "Salo", "Hyvinkää", "Kotka", "Kouvola"],
  east: ["Lappeenranta", "Imatra", "Mikkeli", "Savonlinna", "Joensuu", "Kuopio", "Varkaus", "Pieksämäki", "Lahti"],
  west: ["Tampere", "Turku", "Pori", "Rauma", "Vaasa", "Seinäjoki", "Kokkola", "Sastamala", "Forssa"],
  central: ["Jyväskylä", "Jämsä", "Äänekoski", "Kuopio", "Lahti", "Tampere", "Mikkeli"],
  north: ["Oulu", "Kemi", "Tornio", "Rovaniemi", "Kuusamo", "Kajaani", "Ylivieska"],
};

export const municipalityRegionMap = Object.fromEntries([
  ...logisticsRegionCities.south.map((city) => [city, "south"]),
  ...logisticsRegionCities.east.map((city) => [city, "east"]),
  ...logisticsRegionCities.west.map((city) => [city, "west"]),
  ...logisticsRegionCities.central.map((city) => [city, "central"]),
  ...logisticsRegionCities.north.map((city) => [city, "north"]),
  ["Lappeenranta", "east"],
  ["Helsinki", "south"],
  ["Espoo", "south"],
  ["Vantaa", "south"],
  ["Tampere", "west"],
  ["Turku", "west"],
  ["Oulu", "north"],
  ["Jyväskylä", "central"],
]);

export const pickupPoints = [
  { id: "terminal-hel", name: "Helsinki Terminaali", type: "terminal", city: "Helsinki", address: "Satamakaari 12, Helsinki", active: true, latest_dropoff_time: "18:00", region: "south" },
  { id: "terminal-van", name: "Vantaa Terminaali", type: "terminal", city: "Vantaa", address: "Rahtitie 4, Vantaa", active: true, latest_dropoff_time: "19:00", region: "south" },
  { id: "terminal-lpr", name: "Lappeenranta Terminaali", type: "terminal", city: "Lappeenranta", address: "Teollisuuskatu 8, Lappeenranta", active: true, latest_dropoff_time: "17:30", region: "east" },
  { id: "terminal-mkl", name: "Mikkeli Terminaali", type: "terminal", city: "Mikkeli", address: "Rantakylänkatu 5, Mikkeli", active: true, latest_dropoff_time: "17:00", region: "east" },
  { id: "terminal-kuo", name: "Kuopio Terminaali", type: "terminal", city: "Kuopio", address: "Varastotie 9, Kuopio", active: true, latest_dropoff_time: "18:00", region: "east" },
  { id: "terminal-tre", name: "Tampere Terminaali", type: "terminal", city: "Tampere", address: "Logistiikkakatu 3, Tampere", active: true, latest_dropoff_time: "18:00", region: "west" },
  { id: "terminal-jkl", name: "Jyväskylä Terminaali", type: "terminal", city: "Jyväskylä", address: "Rahtikatu 7, Jyväskylä", active: true, latest_dropoff_time: "17:30", region: "central" },
  { id: "terminal-oul", name: "Oulu Terminaali", type: "terminal", city: "Oulu", address: "Satamatie 11, Oulu", active: true, latest_dropoff_time: "18:00", region: "north" },
  { id: "cp-lpr", name: "Lappeenrannan keräilypiste", type: "collection_point", city: "Lappeenranta", address: "Kauppakatu 21, Lappeenranta", active: true, latest_dropoff_time: "16:30", region: "east" },
  { id: "cp-mkl", name: "Mikkelin keräilypiste", type: "collection_point", city: "Mikkeli", address: "Pursialankatu 4, Mikkeli", active: true, latest_dropoff_time: "16:00", region: "east" },
  { id: "cp-hel", name: "Helsingin keräilypiste", type: "collection_point", city: "Helsinki", address: "Sörnäisten rantatie 6, Helsinki", active: true, latest_dropoff_time: "17:00", region: "south" },
  { id: "cp-van", name: "Vantaan keräilypiste", type: "collection_point", city: "Vantaa", address: "Tikkurilantie 2, Vantaa", active: true, latest_dropoff_time: "17:30", region: "south" },
  { id: "cp-tre", name: "Tampereen keräilypiste", type: "collection_point", city: "Tampere", address: "Hatanpään valtatie 10, Tampere", active: true, latest_dropoff_time: "17:00", region: "west" },
  { id: "cp-jkl", name: "Jyväskylän keräilypiste", type: "collection_point", city: "Jyväskylä", address: "Vapaudenkatu 14, Jyväskylä", active: true, latest_dropoff_time: "16:30", region: "central" },
  { id: "cp-oul", name: "Oulun keräilypiste", type: "collection_point", city: "Oulu", address: "Rantakatu 5, Oulu", active: true, latest_dropoff_time: "17:00", region: "north" },
];

export const transportCompanies = [
  { id: "north-fresh-logistics", name: "North Fresh Logistics", active: true },
];

export const routeRegionPriceMatrix = {
  south: { south: 35, east: 58, west: 52, central: 60, north: 115 },
  east: { south: 55, east: 28, west: 72, central: 54, north: 122 },
  west: { south: 49, east: 70, west: 30, central: 45, north: 108 },
  central: { south: 48, east: 50, west: 44, central: 28, north: 92 },
  north: { south: 110, east: 118, west: 102, central: 88, north: 34 },
};

function buildRoutePrices() {
  const destinations = Array.from(new Set([
    ...alwaysSuggestedDestinationCities,
    ...logisticsRegionCities.south,
    ...logisticsRegionCities.east,
    ...logisticsRegionCities.west,
    ...logisticsRegionCities.central,
    ...logisticsRegionCities.north,
  ]));

  const rows = [];
  for (const point of pickupPoints.filter((item) => item.active)) {
    for (const destinationCity of destinations) {
      const destinationRegion = municipalityRegionMap[destinationCity] || "south";
      const base = routeRegionPriceMatrix[point.region]?.[destinationRegion] ?? 65;
      const typeSurcharge = point.type === "terminal" ? 0 : 8;
      rows.push({
        origin_point_id: point.id,
        destination_city: destinationCity,
        carrier_id: "north-fresh-logistics",
        price_eur: base + typeSurcharge,
        min_kg: 1,
        max_kg: 2000,
        active: true,
        cutoff_time: point.latest_dropoff_time || "17:00",
      });
    }
  }
  return rows;
}

export const routePrices = buildRoutePrices();
