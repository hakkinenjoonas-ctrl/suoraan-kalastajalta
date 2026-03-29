import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { jsPDF } from "jspdf";

const SUPABASE_URL = "https://exuqgemipmaqdkficlfn.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_6OpTn3AxVjMnpei8Bpsy7A_Y8kOXaZP";
const DEFAULT_PUBLIC_APP_URL = "https://suoraan-kalastajalta.vercel.app";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

const fishSpeciesCatalog = [
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
const fishSpeciesVariants = [
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
];
const fishSpeciesByName = Object.fromEntries(
  fishSpeciesCatalog.map((item) => [item.name_fi.toLowerCase(), item])
);
const fishSpecies = [...fishSpeciesCatalog.map((item) => item.name_fi), ...fishSpeciesVariants, "Muu"];
const gearTypes = ["Rysä", "Verkko", "Katiska", "Merta", "Trooli", "Nuotta", "Vapaväline", "Muu"];
const deliveryMethods = ["Nouto", "Myyjä toimittaa", "Kuljetus järjestetään", "Sovitaan erikseen"];
const processedProductTypes = ["Filee", "Graavi", "Kylmäsavu", "Lämminsavu", "Massa", "Pyörykät", "Pihvit", "Muu"];
const processingMethods = ["Fileointi", "Graavaus", "Kylmäsavustus", "Lämminsavustus", "Jauhatus", "Kypsennys", "Muu"];
const COMMISSION_RATE = 0.03;
const finlandMunicipalities = [
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
  "Ylivieska", "Ylöjärvi", "Ypäjä", "Ähtäri", "Äänekoski"
];

const defaultAreas = [
  // SAIMAA
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

  // ITÄ-SUOMI
  "Kallavesi",
  "Unnukka",
  "Suvasvesi",
  "Onkivesi",
  "Porovesi",
  "Iisvesi",
  "Nilakka",
  "Keitele",
  "Konnevesi",

  // ETELÄ / KESKI
  "Päijänne",
  "Puula",
  "Jääsjärvi",
  "Vesijärvi (Lahti)",

  // LÄNSI
  "Näsijärvi",
  "Pyhäjärvi",
  "Pyhäjärvi (Tampere)",
  "Vanajavesi",
  "Kyrösjärvi",
  "Lappajärvi",

  // POHJOINEN
  "Oulujärvi",
  "Inari",
  "Kemijärvi",
  "Lokka",
  "Porttipahta",

  // MERI
  "Suomenlahti",
  "Saaristomeri",
  "Selkämeri",
  "Perämeri",
  "Ahvenanmeri",

  // FALLBACK
  "Muu järvi",
  "Merialue (muu)"
];

const alwaysSuggestedDestinationCities = ["Helsinki", "Vantaa", "Espoo"];
const logisticsRegionCities = {
  south: ["Helsinki", "Espoo", "Vantaa", "Lahti", "Porvoo", "Turku", "Salo", "Hyvinkää", "Kotka", "Kouvola"],
  east: ["Lappeenranta", "Imatra", "Mikkeli", "Savonlinna", "Joensuu", "Kuopio", "Varkaus", "Pieksämäki", "Lahti"],
  west: ["Tampere", "Turku", "Pori", "Rauma", "Vaasa", "Seinäjoki", "Kokkola", "Sastamala", "Forssa"],
  central: ["Jyväskylä", "Jämsä", "Äänekoski", "Kuopio", "Lahti", "Tampere", "Mikkeli"],
  north: ["Oulu", "Kemi", "Tornio", "Rovaniemi", "Kuusamo", "Kajaani", "Ylivieska"],
};
const municipalityRegionMap = Object.fromEntries([
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
const pickupPoints = [
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
const transportCompanies = [
  { id: "north-fresh-logistics", name: "North Fresh Logistics", active: true },
];
const routeRegionPriceMatrix = {
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

const routePrices = buildRoutePrices();

function safeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createSpeciesRow() {
  return { id: safeId(), species: "Muikku", customSpecies: "", kilos: "", count: "", price_per_kg: "" };
}

function getPublicAppBaseUrl() {
  const configuredUrl = typeof import.meta !== "undefined" ? import.meta.env?.VITE_PUBLIC_APP_URL : "";
  if (configuredUrl) return String(configuredUrl).replace(/\/$/, "");

  if (typeof window !== "undefined") {
    const origin = String(window.location.origin || "").replace(/\/$/, "");
    if (origin && !origin.includes("localhost") && !origin.includes("127.0.0.1")) {
      return origin;
    }
  }

  return DEFAULT_PUBLIC_APP_URL;
}

function getSpeciesRowLabel(row) {
  if (row?.species === "Muu") {
    return String(row?.customSpecies || "").trim() || "Muu";
  }
  return row?.species || "";
}

function getSpeciesMetadata(label) {
  const normalized = String(label || "")
    .split(",")[0]
    .replace(/\b(filee|filet|avattu|perattu|päätön|nyljetty)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return fishSpeciesByName[normalized] || null;
}

function isCrayfishSpecies(label) {
  const metadata = getSpeciesMetadata(label);
  return metadata?.scientific === "Pacifastacus leniusculus" || metadata?.scientific === "Astacus astacus";
}

function getSpeciesPriceUnit(label) {
  return isCrayfishSpecies(label) ? "kpl" : "kg";
}

function formatSpeciesForSale(label) {
  const metadata = getSpeciesMetadata(label);
  if (!metadata?.scientific) return String(label || "").trim() || "Muu";
  return `${metadata.name_fi} (${metadata.scientific})`;
}

function formatSpeciesSummaryLine(label, kilos, count) {
  if (isCrayfishSpecies(label)) {
    return `${formatSpeciesForSale(label)}: ${count > 0 ? `${count} kpl` : "-"}${kilos > 0 ? ` (${kilos} kg)` : ""}`;
  }
  return `${formatSpeciesForSale(label)}: ${kilos} kg${count > 0 ? ` (${count} kpl)` : ""}`;
}

function isCrayfishOfferSummary(summary) {
  const text = String(summary || "").toLowerCase();
  return text.includes("täplärapu") ||
    text.includes("jokirapu") ||
    text.includes("pacifastacus leniusculus") ||
    text.includes("astacus astacus");
}

function getOfferDisplayUnit(offer) {
  return isCrayfishOfferSummary(offer?.species_summary) ? "kpl" : "kg";
}

function getOfferQuantityDisplay(offer) {
  const summary = String(offer?.species_summary || "");
  if (isCrayfishOfferSummary(summary)) {
    const countMatch = summary.match(/(\d+(?:[.,]\d+)?)\s*kpl/i);
    if (countMatch) return `${String(countMatch[1]).replace(".", ",")} kpl`;
  }
  const kilos = Number(offer?.total_kilos || 0);
  if (Number.isFinite(kilos) && kilos > 0) return `${kilos} kg`;
  return "-";
}

function formatSpeciesOfferSummaryLine(row) {
  const kilos = Number(row?.kilos || 0);
  const count = Number(row?.count || 0);
  const unit = getSpeciesPriceUnit(getSpeciesRowLabel(row));
  const parsedPrice = parseLocaleNumber(row?.price_per_kg);
  const price = parsedPrice == null ? "-" : `${parsedPrice.toLocaleString("fi-FI")} € / ${unit}`;
  const batchId = String(row?.batch_id || "").trim();
  const catchDate = String(row?.catch_date || row?.date || "").trim();
  return [
    formatSpeciesSummaryLine(getSpeciesRowLabel(row), kilos, count),
    `Hinta ${price}`,
    catchDate ? `Pyyntipäivämäärä ${catchDate}` : "",
    batchId ? `Erätunnus ${batchId}` : "",
  ].filter(Boolean).join(" · ");
}

function parseTradeValueFromSpeciesSummary(summary) {
  return getOfferSummaryLines(summary).reduce((sum, line) => {
    const priceMatch = String(line).match(/Hinta\s+([0-9]+(?:[.,][0-9]+)?)/i);
    if (!priceMatch) return sum;

    const parsedPrice = parseLocaleNumber(priceMatch[1]);
    if (parsedPrice == null || !Number.isFinite(parsedPrice) || parsedPrice <= 0) return sum;

    const countMatch = String(line).match(/\(([0-9]+(?:[.,][0-9]+)?)\s*kpl\)/i);
    if (countMatch) {
      const parsedCount = parseLocaleNumber(countMatch[1]);
      if (parsedCount == null || !Number.isFinite(parsedCount) || parsedCount <= 0) return sum;
      return sum + (parsedCount * parsedPrice);
    }

    const kiloMatch = String(line).match(/:\s*([0-9]+(?:[.,][0-9]+)?)\s*kg/i);
    const parsedKilos = kiloMatch ? parseLocaleNumber(kiloMatch[1]) : null;
    if (parsedKilos == null || !Number.isFinite(parsedKilos) || parsedKilos <= 0) return sum;
    return sum + (parsedKilos * parsedPrice);
  }, 0);
}

function getOfferSummaryLines(summary) {
  return String(summary || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatSpeciesSummaryText(value) {
  return String(value || "")
    .split("\n")
    .map((line) => {
      const [speciesPart, ...rest] = String(line).split(":");
      if (!speciesPart) return line;
      const formattedSpecies = formatSpeciesForSale(speciesPart.trim());
      return rest.length > 0 ? `${formattedSpecies}:${rest.join(":")}` : formattedSpecies;
    })
    .join("\n");
}

function getOfferSummaryBatchItems(summary) {
  return String(summary || "")
    .split("\n")
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .map((line) => {
      const batchMatch = line.match(/Erätunnus\s+([A-Z0-9-]+)/i);
      const catchDateMatch = line.match(/Pyyntipäivämäärä\s+([0-9]{4}-[0-9]{2}-[0-9]{2})/i);
      const label = line
        .replace(/\s*·\s*Hinta\s+.*$/i, "")
        .replace(/\s*·\s*Pyyntipäivämäärä\s+.*?(?=\s*·|$)/i, "")
        .replace(/\s*·\s*Erätunnus\s+.*$/i, "")
        .trim();
      return {
        label,
        catchDate: catchDateMatch ? String(catchDateMatch[1] || "").trim() : "",
        batchId: batchMatch ? String(batchMatch[1] || "").trim() : "",
      };
    })
    .filter((item) => item.label || item.batchId);
}

function getOfferSummaryCatchDates(summary) {
  return Array.from(
    new Set(
      getOfferSummaryBatchItems(summary)
        .map((item) => item.catchDate)
        .filter(Boolean)
    )
  );
}

function formatSourceBatchSummary(entry) {
  if (!entry) return "";
  const species = formatSpeciesForSale(entry.species);
  const kilos = entry.kilos == null || entry.kilos === "" ? "" : `${Number(entry.kilos).toFixed(1)} kg`;
  const count = entry.count == null || entry.count === "" ? "" : `${Number(entry.count)} kpl`;
  return [species, isCrayfishSpecies(entry.species) ? count : kilos, isCrayfishSpecies(entry.species) && kilos ? kilos : "", entry.batchId || ""].filter(Boolean).join(" · ");
}

function getOfferSpeciesHeadline(summary) {
  const firstLine = String(summary || "Kalaerä").split("\n")[0] || "Kalaerä";
  return firstLine
    .replace(/:\s*\d+(?:[.,]\d+)?\s*kg(?:\s*\([^)]*\))?$/i, "")
    .trim() || "Kalaerä";
}

function isMixedOffer(offer) {
  return getOfferSummaryLines(offer?.species_summary).length > 1;
}

function normalizeOfferMatchValue(value) {
  return String(value || "").trim();
}

function offersShareSameLot(left, right) {
  if (!left || !right) return false;

  const sameSeller = normalizeOfferMatchValue(left.seller_user_id) === normalizeOfferMatchValue(right.seller_user_id);
  if (!sameSeller) return false;

  const leftBatchId = normalizeOfferMatchValue(left.batch_id);
  const rightBatchId = normalizeOfferMatchValue(right.batch_id);
  if (leftBatchId && rightBatchId && leftBatchId === rightBatchId) {
    return true;
  }

  return (
    normalizeOfferMatchValue(left.species_summary) === normalizeOfferMatchValue(right.species_summary) &&
    Number(left.total_kilos || 0) === Number(right.total_kilos || 0) &&
    normalizeOfferMatchValue(left.area) === normalizeOfferMatchValue(right.area) &&
    normalizeOfferMatchValue(left.spot) === normalizeOfferMatchValue(right.spot)
  );
}

function billingMatchesDelivery(fields) {
  return (
    String(fields?.deliveryAddress || "") === String(fields?.billingAddress || "") &&
    String(fields?.deliveryPostcode || "") === String(fields?.billingPostcode || "") &&
    String(fields?.deliveryCity || "") === String(fields?.billingCity || "")
  );
}

function billingMatchesAddress(fields) {
  return (
    String(fields?.address || "") === String(fields?.billingAddress || "") &&
    String(fields?.postcode || "") === String(fields?.billingPostcode || "") &&
    String(fields?.city || "") === String(fields?.billingCity || "")
  );
}

function buyerBillingMatchesDelivery(fields) {
  return (
    String(fields?.delivery_address || "") === String(fields?.billing_address || "") &&
    String(fields?.delivery_postcode || "") === String(fields?.billing_postcode || "") &&
    String(fields?.delivery_city || "") === String(fields?.billing_city || "")
  );
}

function inferLogisticsRegion(originCity, area) {
  const city = String(originCity || "").trim();
  if (city && municipalityRegionMap[city]) return municipalityRegionMap[city];

  const areaValue = String(area || "").toLowerCase();
  if (["saimaa", "puruvesi", "haukivesi", "pihlajavesi", "orivesi", "pyhäselkä", "luonteri", "kallavesi"].some((value) => areaValue.includes(value))) {
    return "east";
  }
  if (["suomenlahti", "saaristomeri", "selkämeri", "ahvenanmeri"].some((value) => areaValue.includes(value))) {
    return "south";
  }
  if (["perämeri", "oulujärvi", "inari", "kemijärvi"].some((value) => areaValue.includes(value))) {
    return "north";
  }
  if (["päijänne", "puula", "vesijärvi", "konnevesi", "keitele"].some((value) => areaValue.includes(value))) {
    return "central";
  }
  if (["näsijärvi", "pyhäjärvi", "vanajavesi", "kyrösjärvi", "lappajärvi"].some((value) => areaValue.includes(value))) {
    return "west";
  }
  return "south";
}

function getSuggestedDestinationCities(originCity, area) {
  const region = inferLogisticsRegion(originCity, area);
  const regionCities = logisticsRegionCities[region] || [];
  return Array.from(new Set([...alwaysSuggestedDestinationCities, ...regionCities]))
    .filter(Boolean)
    .slice(0, 10);
}

function getTransportModeLabel(mode) {
  if (mode === "terminal") return "Vie terminaaliin";
  if (mode === "pickup") return "Kuljetusfirma noutaa";
  if (mode === "collection_point") return "Vie keräilypisteeseen";
  return "-";
}

function getTransportPointType(mode) {
  if (mode === "terminal") return "terminal";
  if (mode === "collection_point") return "collection_point";
  return "";
}

function getAvailableOriginPoints(originCity, area, mode) {
  const targetType = getTransportPointType(mode);
  const region = inferLogisticsRegion(originCity, area);
  return pickupPoints
    .filter((point) => point.active && point.type === targetType && (point.region === region || point.city === originCity || point.region === "south"))
    .slice(0, 6);
}

function getOriginPointById(originPointId) {
  return pickupPoints.find((point) => point.id === originPointId) || null;
}

function getRoutePrice(originPointId, destinationCity, kilos) {
  const matched = routePrices.find((row) =>
    row.active &&
    row.origin_point_id === originPointId &&
    row.destination_city === destinationCity &&
    Number(kilos || 0) >= Number(row.min_kg || 0) &&
    Number(kilos || 0) <= Number(row.max_kg || Number.MAX_SAFE_INTEGER),
  );
  if (!matched) return null;
  const carrier = transportCompanies.find((company) => company.id === matched.carrier_id && company.active) || null;
  return {
    ...matched,
    carrier_name: carrier?.name || "",
  };
}

function getRouteOptionsForPoint(originPointId, kilos) {
  return routePrices
    .filter((row) =>
      row.active &&
      row.origin_point_id === originPointId &&
      Number(kilos || 0) >= Number(row.min_kg || 0) &&
      Number(kilos || 0) <= Number(row.max_kg || Number.MAX_SAFE_INTEGER),
    )
    .sort((a, b) => a.destination_city.localeCompare(b.destination_city, "fi"))
    .map((row) => ({
      ...row,
      carrier_name: transportCompanies.find((company) => company.id === row.carrier_id)?.name || "",
    }));
}

function getOfferProductTotal(rows) {
  return rows.reduce((sum, row) => {
    const price = Number(row.price_per_kg || 0);
    if (!Number.isFinite(price) || price <= 0) return sum;
    if (getSpeciesPriceUnit(getSpeciesRowLabel(row)) === "kpl") {
      return sum + Number(row.count || 0) * price;
    }
    return sum + Number(row.kilos || 0) * price;
  }, 0);
}

function formatDeliveryPrice(value) {
  if (value === null || value === undefined || value === "") return "-";
  const number = Number(value);
  if (Number.isNaN(number)) return String(value || "-");
  return `${number.toLocaleString("fi-FI")} €`;
}

function formatDeliveredPricePerKg(value) {
  if (value === null || value === undefined || value === "") return "-";
  const number = Number(value);
  if (Number.isNaN(number)) return String(value || "-");
  return `${number.toLocaleString("fi-FI")} €/kg`;
}

function formatEntryPrice(rowOrSpecies, value) {
  const unit = getSpeciesPriceUnit(typeof rowOrSpecies === "string" ? rowOrSpecies : getSpeciesRowLabel(rowOrSpecies));
  if (value === "" || value == null) return "";
  return `${euro(value)} / ${unit}`;
}

function parsePricePerKgFromNotes(notes) {
  const match = String(notes || "").match(/Hinta:\s*([0-9]+(?:[.,][0-9]+)?)\s*€/i);
  if (!match) return "";
  const parsed = Number(String(match[1]).replace(",", "."));
  return Number.isNaN(parsed) ? "" : parsed;
}

function extractVisibleAdditionalNotes(notes) {
  const lines = String(notes || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return "";

  const cleaned = [];
  let inSpeciesBlock = false;
  for (const line of lines) {
    if (line === "Erän lajit:") {
      inSpeciesBlock = true;
      continue;
    }
    if (line === "Toimitus:") {
      inSpeciesBlock = false;
      continue;
    }
    if (inSpeciesBlock) continue;
    if (
      line.startsWith("Hinta:") ||
      line.startsWith("Toimitustapa:") ||
      line.startsWith("Toimitusalue:") ||
      line.startsWith("Noutopaikka:") ||
      line.startsWith("Toimituskustannus:") ||
      line.startsWith("Aikaisin toimitus:") ||
      line.startsWith("Kylmäkuljetus:") ||
      line.startsWith("Kaupallisen kalastajan tunnus:") ||
      line.startsWith("Paikkakunta:")
    ) {
      continue;
    }
    cleaned.push(line);
  }

  return cleaned.join("\n");
}

function getBatchPublicUrl(batchId) {
  if (!batchId) return "";
  return `${getPublicAppBaseUrl()}/batch/${encodeURIComponent(batchId)}`;
}

function getBatchTraceValue(batchId) {
  if (!batchId) return "";
  return getBatchPublicUrl(batchId);
}

function getBatchQrImageUrl(batchId) {
  const traceValue = getBatchTraceValue(batchId);
  return traceValue ? `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(traceValue)}` : "";
}

function canPrintCatchLabels(entry) {
  return Boolean(entry?.batchId && entry?.species && entry?.date);
}

function getCatchLabelScientificName(speciesValue) {
  const normalized = normalizeFishSpeciesLabel(speciesValue);
  return fishSpeciesByName[normalized]?.scientific || "";
}

function getCatchLabelProductForm(speciesValue) {
  const text = String(speciesValue || "").trim();
  if (!text) return "";
  const parts = text.split(",");
  return parts.length > 1 ? parts.slice(1).join(",").trim() : "";
}

function buildCatchLabelData(entry, profileLike, boxNumber, totalBoxes) {
  const species = formatSpeciesForSale(entry?.species || "");
  const scientificName = getCatchLabelScientificName(entry?.species);
  const productForm = getCatchLabelProductForm(entry?.species);
  const supplierNameParts = [
    String(profileLike?.company_name || profileLike?.companyName || "").trim(),
    String(entry?.ownerName || profileLike?.display_name || "").trim(),
  ].filter(Boolean);
  const supplier = supplierNameParts.join(" / ") || String(entry?.ownerName || profileLike?.display_name || "").trim() || "-";
  const supplierAddress = [
    String(profileLike?.address || "").trim(),
    String(profileLike?.postcode || "").trim(),
    String(profileLike?.city || "").trim(),
  ].filter(Boolean).join(", ");
  const supplierContact = [
    String(profileLike?.contact_email || profileLike?.email || "").trim(),
    String(profileLike?.phone || "").trim(),
  ].filter(Boolean).join(" · ");
  const boxLabel = `${boxNumber}/${totalBoxes}`;

  return {
    species,
    scientificName,
    batchId: String(entry?.batchId || "").trim(),
    catchDate: String(entry?.date || "").trim(),
    catchArea: [entry?.area, entry?.municipality, entry?.spot].filter(Boolean).join(" / "),
    gearType: String(entry?.gear || "").trim(),
    productForm,
    supplier,
    supplierAddress,
    supplierContact,
    boxLabel,
  };
}

function getCatchLabelQrImageUrl(labelData) {
  const qrLines = [
    labelData.species || "-",
    labelData.catchDate ? `Pyyntipäivä: ${labelData.catchDate}` : "",
    labelData.batchId ? `Erätunnus: ${labelData.batchId}` : "",
    labelData.scientificName ? `Tieteellinen nimi: ${labelData.scientificName}` : "",
    labelData.catchArea ? `Pyyntialue: ${labelData.catchArea}` : "",
    labelData.gearType ? `Pyyntimenetelmä: ${labelData.gearType}` : "",
    labelData.productForm ? `Tuote: ${labelData.productForm}` : "",
    `Toimittaja: ${labelData.supplier || "-"}`,
    labelData.supplierAddress ? `Osoite: ${labelData.supplierAddress}` : "",
    labelData.supplierContact ? `Yhteystiedot: ${labelData.supplierContact}` : "",
  ].filter(Boolean);

  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrLines.join("\n"))}`;
}

function getAppLogoUrl() {
  if (typeof window === "undefined") return "/logo.png";
  return new URL("/logo.png", window.location.origin).toString();
}

function buildCatchLabelPrintHtml(entry, profileLike, labelCount) {
  const count = Math.max(1, Number(labelCount || 1));
  const labels = Array.from({ length: count }, (_, index) => {
    const labelData = buildCatchLabelData(entry, profileLike, index + 1, count);
    return {
      ...labelData,
      qrImageUrl: getCatchLabelQrImageUrl(labelData),
      logoUrl: getAppLogoUrl(),
    };
  });

  const pages = [];
  for (let index = 0; index < labels.length; index += 10) {
    pages.push(labels.slice(index, index + 10));
  }

  const renderLabel = (label) => `
    <div class="label">
      <div class="label-inner">
        <div class="label-main">
          <div class="label-main-top">
            <div class="species">${label.species || "-"}</div>
            ${label.scientificName ? `<div class="scientific">${label.scientificName}</div>` : ""}
            <div class="batch">Erätunnus: ${label.batchId || "-"}</div>
          ${label.catchArea ? `<div class="line">Pyyntialue: ${label.catchArea}</div>` : ""}
          ${label.gearType ? `<div class="line">Pyyntimenetelmä: ${label.gearType}</div>` : ""}
          ${label.catchDate ? `<div class="line">Pyyntipäivä: ${label.catchDate}</div>` : ""}
          ${label.productForm ? `<div class="line">Tuote: ${label.productForm}</div>` : ""}
          <div class="line">Säilytys: 0–2 °C</div>
        </div>
          <div class="weight-line"><span class="weight-label">Paino:</span><span class="weight-write"></span><span class="weight-unit">kg</span></div>
          <div class="supplier-block">
            <div class="line">Toimittaja: ${label.supplier || "-"}</div>
            ${label.supplierAddress ? `<div class="line">${label.supplierAddress}</div>` : ""}
            ${label.supplierContact ? `<div class="line">${label.supplierContact}</div>` : ""}
          </div>
        </div>
        <div class="label-side">
          <div class="label-brand">
            <img src="${label.logoUrl}" alt="Suoraan Kalastajalta" />
            <div class="label-brand-text">
              <div>Suoraan</div>
              <div>Kalastajalta</div>
            </div>
          </div>
          <div class="label-qr">
            <img src="${label.qrImageUrl}" alt="QR ${label.batchId}" />
          </div>
        </div>
      </div>
    </div>
  `;

  return `
    <!doctype html>
    <html lang="fi">
      <head>
        <meta charset="utf-8" />
        <title>Kalaetiketit ${String(entry?.batchId || "")}</title>
        <style>
          @page { size: A4 portrait; margin: 4mm 0 4mm 0; }
          * { box-sizing: border-box; }
          body { margin: 0; font-family: Inter, Arial, sans-serif; background: #fff; color: #111827; }
          .sheet { width: 210mm; height: 289mm; margin: 0 auto; display: grid; grid-template-columns: 105mm 105mm; grid-template-rows: repeat(5, 56.4mm); gap: 0; align-content: start; }
          .page-break { page-break-after: always; }
          .label { width: 105mm; height: 56.4mm; padding: 1.8mm 2.6mm; }
          .label-inner { width: 100%; height: 100%; padding: 1.8mm; display: grid; grid-template-columns: 1fr 27mm; gap: 1.8mm; overflow: hidden; }
          .label-main { height: 100%; padding-left: 3mm; display: flex; flex-direction: column; min-width: 0; }
          .label-main-top { min-width: 0; }
          .supplier-block { margin-top: auto; min-width: 0; }
          .species { font-size: 12.6pt; font-weight: 800; line-height: 1.03; margin-bottom: 0.45mm; }
          .scientific { font-size: 6.2pt; line-height: 1.12; color: #475569; margin-bottom: 0.7mm; }
          .batch { font-size: 7.2pt; font-weight: 800; background: #eff6ff; border: 0.22mm solid #93c5fd; border-radius: 1.2mm; padding: 0.7mm 0.9mm; margin-bottom: 0.7mm; }
          .line { font-size: 6.25pt; line-height: 1.12; margin-bottom: 0.3mm; }
          .weight-line { display: flex; align-items: flex-end; gap: 1.1mm; font-size: 6.5pt; margin: 1.8mm 0 0.9mm; min-height: 6.4mm; }
          .weight-label { font-weight: 700; white-space: nowrap; }
          .weight-write { flex: 1; min-width: 0; border-bottom: 0.3mm solid #0f172a; height: 3.6mm; }
          .weight-unit { font-weight: 700; white-space: nowrap; }
          .label-side { display: flex; flex-direction: column; justify-content: space-between; align-items: flex-start; min-width: 0; }
          .label-brand { display: flex; flex-direction: column; align-items: center; width: 100%; padding-top: 0.6mm; }
          .label-brand img { width: 12mm; height: 12mm; object-fit: contain; margin-bottom: 0.6mm; }
          .label-brand-text { font-size: 5.2pt; line-height: 1.05; font-weight: 700; text-align: center; color: #0f172a; }
          .label-qr { display: flex; align-items: flex-end; justify-content: flex-start; width: 100%; }
          .label-qr img { width: 18mm; height: 18mm; object-fit: contain; border: 0.22mm solid #cbd5e1; border-radius: 1.2mm; padding: 0.8mm; background: #fff; }
        </style>
      </head>
      <body>
        ${pages.map((page, pageIndex) => `<div class="sheet ${pageIndex < pages.length - 1 ? "page-break" : ""}">${page.map((label) => renderLabel(label)).join("")}</div>`).join("")}
      </body>
    </html>
  `;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Tiedoston muunto data-URL:ksi epäonnistui."));
    reader.readAsDataURL(blob);
  });
}

async function fetchImageDataUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Kuvan haku epäonnistui (HTTP ${response.status}).`);
  }
  const blob = await response.blob();
  return blobToDataUrl(blob);
}

function buildCatchLabelPdfFileName(entry) {
  return `kalaetiketit-${String(entry?.batchId || "era").replace(/[^a-zA-Z0-9-_]+/g, "_")}.pdf`;
}

async function buildCatchLabelPdf(entry, profileLike, labelCount) {
  const count = Math.max(1, Number(labelCount || 1));
  const labels = Array.from({ length: count }, (_, index) => buildCatchLabelData(entry, profileLike, index + 1, count));
  const [qrDataUrls, logoDataUrl] = await Promise.all([
    Promise.all(labels.map((label) => fetchImageDataUrl(getCatchLabelQrImageUrl(label)))),
    fetchImageDataUrl(getAppLogoUrl()).catch(() => ""),
  ]);

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const labelWidth = 105;
  const labelHeight = 57;
  const topMargin = 6;
  const rowGap = 0;
  const logoSize = 12;
  const qrSize = 18;
  const labelPaddingX = 6.2;
  const labelPaddingY = 2.4;
  const qrRightInset = 5;
  const qrColumnWidth = 27;
  const contentWidth = labelWidth - (labelPaddingX * 2) - qrColumnWidth - 2.4;

  const drawLabel = (label, qrDataUrl, x, y) => {
    const left = x + labelPaddingX;
    const top = y + labelPaddingY;
    const qrX = x + labelWidth - labelPaddingX - qrSize - qrRightInset;
    const qrY = y + labelHeight - labelPaddingY - qrSize;
    const brandX = qrX + ((qrSize - logoSize) / 2);
    const brandY = top + 0.2;
    const textWidth = qrX - left - 2.4;
    let currentY = top + 4.2;

    if (logoDataUrl) {
      doc.addImage(logoDataUrl, "PNG", brandX, brandY, logoSize, logoSize);
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.2);
    doc.text("Suoraan", qrX + (qrSize / 2), brandY + logoSize + 2.4, { align: "center" });
    doc.text("Kalastajalta", qrX + (qrSize / 2), brandY + logoSize + 4.7, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13.5);
    const speciesLines = doc.splitTextToSize(label.species || "-", textWidth);
    doc.text(speciesLines, left, currentY);
    currentY += speciesLines.length * 4.8;

    if (label.scientificName) {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      doc.setFontSize(7);
      const scientificLines = doc.splitTextToSize(label.scientificName, textWidth);
      doc.text(scientificLines, left, currentY);
      currentY += scientificLines.length * 3;
      doc.setTextColor(17, 24, 39);
    }

    currentY += 0.5;
    doc.setFillColor(239, 246, 255);
    doc.setDrawColor(147, 197, 253);
    doc.roundedRect(left, currentY - 2.6, textWidth, 6.2, 1.1, 1.1, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.6);
    doc.text(`Erätunnus: ${label.batchId || "-"}`, left + 1.2, currentY + 1.6);
    currentY += 5.6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.4);
    const lines = [
      label.catchArea ? `Pyyntialue: ${label.catchArea}` : "",
      label.gearType ? `Pyyntimenetelmä: ${label.gearType}` : "",
      label.catchDate ? `Pyyntipäivä: ${label.catchDate}` : "",
      label.productForm ? `Tuote: ${label.productForm}` : "",
    ].filter(Boolean);

    lines.forEach((line) => {
      const wrapped = doc.splitTextToSize(line, textWidth);
      doc.text(wrapped, left, currentY);
      currentY += wrapped.length * 2.8;
    });

    currentY += 0.8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.2);
    doc.text("Säilytys: 0–2 °C", left, currentY);
    currentY += 5.2;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.text("Paino:", left, currentY);
    doc.setLineWidth(0.25);
    doc.line(left + 11, currentY + 0.2, qrX - 5, currentY + 0.2);
    doc.text("kg", qrX - 3.8, currentY);
    currentY += 5.2;

    const supplierLines = [
      `Toimittaja: ${label.supplier || "-"}`,
      label.supplierAddress || "",
      label.supplierContact || "",
    ].filter(Boolean);
    const wrappedSupplierLines = supplierLines.flatMap((line) => doc.splitTextToSize(line, textWidth));
    const supplierLineHeight = 2.6;
    const supplierBlockHeight = wrappedSupplierLines.length * supplierLineHeight;
    const supplierStartY = Math.max(currentY + 0.6, qrY + qrSize - supplierBlockHeight);
    wrappedSupplierLines.forEach((line, index) => {
      doc.text(line, left, supplierStartY + (index * supplierLineHeight));
    });

    doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);
  };

  labels.forEach((label, index) => {
    if (index > 0 && index % 10 === 0) {
      doc.addPage("a4", "portrait");
    }
    const pageIndex = index % 10;
    const row = Math.floor(pageIndex / 2);
    const col = pageIndex % 2;
    const x = col * labelWidth;
    const y = topMargin + row * (labelHeight + rowGap);
    drawLabel(label, qrDataUrls[index], x, y);
  });

  return doc;
}

function getRequestedPublicBatchId() {
  if (typeof window === "undefined") return "";
  const pathname = String(window.location.pathname || "");
  if (pathname.startsWith("/batch/")) {
    return decodeURIComponent(pathname.slice("/batch/".length)).trim();
  }
  const params = new URLSearchParams(window.location.search);
  if (!params.get("offer") && params.get("batch")) {
    return String(params.get("batch") || "").trim();
  }
  return "";
}

function getRequestedOfferId() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return String(params.get("offer") || "").trim();
}

function fulfillmentStatusLabel(status) {
  if (status === "awaiting_contact") return "Yhteydenotto kesken";
  if (status === "delivery_agreed") return "Toimitus sovittu";
  if (status === "delivered") return "Toimitettu";
  return "Yhteydenotto kesken";
}

function getPublicBatchInfoUrl(batchId) {
  if (!batchId) return "";
  return `${SUPABASE_URL}/functions/v1/public-batch-info?batchId=${encodeURIComponent(batchId)}`;
}

async function invokeEdgeFunctionAuthenticated(functionName, body, accessToken) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      data,
      error: {
        message: data?.error || `HTTP ${response.status}`,
        status: response.status,
        context: data,
      },
    };
  }

  return { data, error: null };
}

function formatBatchArea(area) {
  return String(area || "BATCH")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase() || "BATCH";
}

function formatBatchSourceIdentifier(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toUpperCase();
}

function parseCommercialFishingVesselIds(value) {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean)));
  }

  return Array.from(
    new Set(
      String(value || "")
        .split(/[\n,;]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function getCommercialFishingVesselIds(profileLike) {
  const multiple = parseCommercialFishingVesselIds(profileLike?.commercial_fishing_vessel_ids);
  if (multiple.length > 0) return multiple;
  return parseCommercialFishingVesselIds(profileLike?.commercial_fishing_vessel_id);
}

function getPreferredBatchSourceIdentifier(profileLike, selectedVesselId = "") {
  return String(
    profileLike?.evira_facility_id ||
    selectedVesselId ||
    getCommercialFishingVesselIds(profileLike)[0] ||
    profileLike?.commercial_fishing_vessel_id ||
    profileLike?.commercial_fishing_id ||
    ""
  ).trim();
}

function formatBatchDate(dateValue) {
  const normalized = String(dateValue || today()).slice(0, 10);
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return normalized.replace(/[^0-9]/g, "").slice(-6);
  return `${match[1].slice(2)}${match[2]}${match[3]}`;
}

function normalizeFishSpeciesLabel(value) {
  return String(value || "")
    .split(",")[0]
    .replace(/\b(filee|filet|avattu|perattu|päätön|nyljetty)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getSpeciesFaoCode(speciesLabels) {
  const labels = Array.isArray(speciesLabels) ? speciesLabels : [speciesLabels];
  const normalizedLabels = labels
    .map((label) => normalizeFishSpeciesLabel(label))
    .filter(Boolean);

  const uniqueLabels = Array.from(new Set(normalizedLabels));
  if (uniqueLabels.length === 0) return "MIX";
  if (uniqueLabels.length > 1) return "MIX";

  const directMatch = fishSpeciesByName[uniqueLabels[0]]?.fao;
  if (directMatch) return directMatch;

  return uniqueLabels[0]
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "")
    .slice(0, 3)
    .toUpperCase() || "MIX";
}

function formatBatchQuantity(value) {
  const quantity = Number(value || 0);
  if (!Number.isFinite(quantity) || quantity <= 0) return "0";
  if (Number.isInteger(quantity)) return String(quantity);
  return quantity.toFixed(3).replace(/\.?0+$/, "").replace(/[^0-9]/g, "");
}

function getBatchSequenceNumber(batchId) {
  const match = String(batchId || "").match(/-(\d+)$/);
  if (!match) return 0;
  return Number(match[1] || 0);
}

async function generateBatchId({ sourceIdentifier, date, speciesLabels, quantity, supabaseClient, ownerUserId, insertSeparatorAfterSource = false }) {
  const batchSourceIdentifier = formatBatchSourceIdentifier(sourceIdentifier);
  if (!batchSourceIdentifier) {
    throw new Error("Aseta kaupallisen kalastusaluksen tunnus tai kaupallisen kalastajan tunnus kohdassa Omat tiedot ennen eräkoodin luontia.");
  }

  const batchDate = formatBatchDate(date);
  const speciesCode = getSpeciesFaoCode(speciesLabels);
  const quantityCode = formatBatchQuantity(quantity);
  const prefix = `${batchSourceIdentifier}${insertSeparatorAfterSource ? "-" : ""}${batchDate}${speciesCode}${quantityCode}`;

  if (!ownerUserId) {
    throw new Error("Käyttäjän tunniste puuttuu eräkoodin luontia varten.");
  }

  const [catchResult, processedResult] = await Promise.all([
    supabaseClient
      .from("catch_entries")
      .select("batch_id")
      .eq("owner_user_id", ownerUserId),
    supabaseClient
      .from("processed_batches")
      .select("batch_id")
      .eq("owner_user_id", ownerUserId),
  ]);

  if (catchResult.error) throw catchResult.error;
  if (processedResult.error && processedResult.error.code !== "PGRST116") throw processedResult.error;

  const highestSequence = [...(catchResult.data || []), ...(processedResult.data || [])].reduce((maxValue, row) => {
    return Math.max(maxValue, getBatchSequenceNumber(row?.batch_id));
  }, 0);

  const sequence = String(highestSequence + 1);
  return `${prefix}-${sequence}`;
}

function euro(value) {
  return new Intl.NumberFormat("fi-FI", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function parseLocaleNumber(value) {
  if (value === "" || value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value)
    .trim()
    .replace(/\s+/g, "")
    .replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function describeOfferEmailError(error) {
  if (!error) return "Tarjoussähköpostin lähetys epäonnistui";
  if (typeof error === "string") return error;
  if (typeof error?.message === "string" && error.message.trim()) return error.message;
  if (typeof error?.error === "string" && error.error.trim()) return error.error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function calculateCommissionDetails(offer, commissionRate = 0.03) {
  const kilos = Number(offer?.reserved_kilos || offer?.total_kilos || 0);
  const pricePerKg = Number(
    offer?.counter_price_per_kg || offer?.price_per_kg || offer?.offer_price_per_kg || 0
  );
  const directTradeValue = kilos * pricePerKg;
  const summaryTradeValue = parseTradeValueFromSpeciesSummary(offer?.species_summary);
  const tradeValue = directTradeValue > 0 ? directTradeValue : summaryTradeValue;
  const commissionValue = tradeValue * commissionRate;

  return {
    billingKilos: kilos,
    billingPricePerKg: pricePerKg,
    tradeValue,
    commissionValue,
  };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function exportCsv(filename, rows) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(";"))
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function isMissingRefreshTokenError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("invalid refresh token") || message.includes("refresh token not found");
}

async function clearBrokenSession() {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // ignore
  }

  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.includes("supabase")) keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch {
    // ignore
  }
}

function runLocalTests() {
  const tests = [
    { name: "Kuha on kalalistassa", pass: fishSpecies.includes("Kuha") },
    { name: "Nuotta on pyydyslistassa", pass: gearTypes.includes("Nuotta") },
    { name: "Merta on pyydyslistassa", pass: gearTypes.includes("Merta") },
    { name: "Muu on vesialuelistassa", pass: defaultAreas.includes("Muu") },
    { name: "Refresh token -virhe tunnistuu", pass: isMissingRefreshTokenError(new Error("Invalid Refresh Token: Refresh Token Not Found")) },
  ];
  const failed = tests.filter((test) => !test.pass);
  if (failed.length > 0) {
    console.error("Paikalliset testit epäonnistuivat:", failed);
  }
}

const styles = {
  app: {
    minHeight: "100vh",
    background: "radial-gradient(circle at top left, rgba(191,219,254,0.55) 0%, rgba(239,246,255,0.96) 26%, rgba(219,234,254,0.82) 54%, rgba(239,246,255,1) 100%)",
    color: "#0f172a",
    fontFamily: '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    padding: 20,
  },
  container: { maxWidth: 1320, margin: "0 auto" },
  card: {
    background: "rgba(255,255,255,0.88)",
    border: "1px solid rgba(148, 184, 255, 0.28)",
    borderRadius: 24,
    boxShadow: "0 22px 50px rgba(30, 64, 175, 0.08)",
    backdropFilter: "blur(10px)",
  },
  headerCard: {
    padding: 24,
    marginBottom: 22,
    background: "linear-gradient(140deg, rgba(239,246,255,0.98) 0%, rgba(219,234,254,0.95) 42%, rgba(186,230,253,0.92) 100%)",
    border: "1px solid rgba(125, 176, 255, 0.38)",
  },
  sectionCard: { padding: 20 },
  row: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" },
  rowBetween: {
    display: "flex",
    gap: 16,
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
  },
  title: { margin: 0, fontSize: 38, lineHeight: 1.02, letterSpacing: "-0.04em", fontWeight: 800, color: "#0f172a" },
  subtitle: { margin: "8px 0 0", color: "#475569", fontSize: 14, lineHeight: 1.5 },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 13px",
    borderRadius: 999,
    background: "rgba(239,246,255,0.95)",
    color: "#1e3a8a",
    fontSize: 13,
    fontWeight: 600,
    border: "1px solid rgba(147, 197, 253, 0.92)",
  },
  toolbar: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },
  tabs: {
    display: "grid",
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
    gap: 8,
    background: "rgba(255,255,255,0.75)",
    border: "1px solid rgba(147, 197, 253, 0.42)",
    padding: 8,
    borderRadius: 22,
    marginBottom: 18,
    boxShadow: "0 16px 36px rgba(37, 99, 235, 0.07)",
  },
  tabs6: {
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
    gap: 8,
    background: "rgba(255,255,255,0.75)",
    border: "1px solid rgba(147, 197, 253, 0.42)",
    padding: 8,
    borderRadius: 22,
    marginBottom: 18,
    boxShadow: "0 16px 36px rgba(37, 99, 235, 0.07)",
  },
  tab: {
    border: 0,
    background: "transparent",
    padding: "13px 12px",
    borderRadius: 16,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    color: "#1e3a8a",
    fontWeight: 700,
  },
  activeTab: { background: "linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%)", color: "#fff", boxShadow: "0 14px 28px rgba(37, 99, 235, 0.24)" },
  grid3: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 18 },
  grid2: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 18 },
  stack: { display: "flex", flexDirection: "column", gap: 14 },
  metric: { fontSize: 40, fontWeight: 800, margin: "10px 0 0", letterSpacing: "-0.04em", color: "#0f172a" },
  muted: { color: "#475569", fontSize: 14, lineHeight: 1.55 },
  progress: { height: 12, background: "rgba(191,219,254,0.48)", borderRadius: 999, overflow: "hidden" },
  progressFill: { display: "block", height: "100%", background: "linear-gradient(90deg, #2563eb 0%, #0ea5e9 100%)", borderRadius: 999 },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 },
  field: { display: "flex", flexDirection: "column", gap: 8 },
  fieldFull: { gridColumn: "1 / -1" },
  input: {
    width: "100%",
    padding: "13px 15px",
    border: "1px solid rgba(147, 197, 253, 0.75)",
    borderRadius: 16,
    background: "rgba(255,255,255,0.94)",
    font: "inherit",
    boxSizing: "border-box",
    color: "#0f172a",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.65)",
  },
  textarea: {
    width: "100%",
    padding: "13px 15px",
    border: "1px solid rgba(147, 197, 253, 0.75)",
    borderRadius: 16,
    background: "rgba(255,255,255,0.94)",
    font: "inherit",
    minHeight: 108,
    resize: "vertical",
    boxSizing: "border-box",
    color: "#0f172a",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.65)",
  },
  button: {
    border: "1px solid rgba(147, 197, 253, 0.72)",
    background: "rgba(255,255,255,0.92)",
    color: "#1e3a8a",
    borderRadius: 16,
    padding: "11px 16px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    fontWeight: 700,
    boxShadow: "0 10px 22px rgba(37, 99, 235, 0.08)",
  },
  primaryButton: { background: "linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%)", color: "#fff", borderColor: "#2563eb" },
  speciesBox: {
    border: "1px solid rgba(147, 197, 253, 0.4)",
    borderRadius: 20,
    background: "linear-gradient(140deg, rgba(248,250,252,0.98) 0%, rgba(239,246,255,0.98) 55%, rgba(224,242,254,0.9) 100%)",
    padding: 18,
  },
  speciesRow: {
    display: "grid",
    gridTemplateColumns: "1.4fr 0.8fr 0.8fr auto",
    gap: 12,
    alignItems: "end",
    background: "rgba(255,255,255,0.96)",
    border: "1px solid rgba(191, 219, 254, 0.95)",
    borderRadius: 18,
    padding: 14,
    boxShadow: "0 10px 22px rgba(59, 130, 246, 0.05)",
  },
  entry: {
    border: "1px solid rgba(191, 219, 254, 0.82)",
    borderRadius: 20,
    padding: 16,
    background: "rgba(255,255,255,0.92)",
    boxShadow: "0 16px 34px rgba(37, 99, 235, 0.06)",
  },
  entryHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  entryBadges: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 },
  noticeError: {
    padding: "13px 15px",
    borderRadius: 16,
    fontSize: 14,
    background: "linear-gradient(135deg, #fef2f2 0%, #fff7f7 100%)",
    color: "#b91c1c",
    border: "1px solid #fecaca",
  },
  noticeInfo: {
    padding: "13px 15px",
    borderRadius: 16,
    fontSize: 14,
    background: "linear-gradient(135deg, #eff6ff 0%, #f8fbff 100%)",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe",
    whiteSpace: "pre-wrap",
  },
  noticeSuccess: {
    padding: "13px 15px",
    borderRadius: 16,
    fontSize: 14,
    background: "linear-gradient(135deg, #ecfeff 0%, #f0f9ff 100%)",
    color: "#0f766e",
    border: "1px solid #a5f3fc",
    whiteSpace: "pre-wrap",
  },
  small: { fontSize: 12, color: "#64748b", lineHeight: 1.45 },
  offerBox: {
    border: "1px solid #bfdbfe",
    borderRadius: 20,
    background: "linear-gradient(140deg, #eff6ff 0%, #f0f9ff 58%, #e0f2fe 100%)",
    padding: 18,
  },
  successHighlightBox: {
    border: "1px solid #93c5fd",
    borderRadius: 20,
    background: "linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%)",
    padding: 18,
  },
  checkboxRow: { display: "flex", gap: 20, flexWrap: "wrap" },
  checkboxCard: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "11px 15px",
    borderRadius: 999,
    border: "1px solid rgba(147, 197, 253, 0.85)",
    background: "rgba(255,255,255,0.95)",
    fontWeight: 600,
    color: "#1e3a8a",
  },
  qrBlock: {
    display: "inline-flex",
    flexDirection: "column",
    gap: 8,
    padding: 12,
    borderRadius: 18,
    border: "1px solid #bfdbfe",
    background: "linear-gradient(135deg, #f8fbff 0%, #eef6ff 100%)",
    alignItems: "center",
    width: "fit-content",
  },
  qrImage: {
    width: 96,
    height: 96,
    borderRadius: 12,
    border: "1px solid rgba(147, 197, 253, 0.75)",
    background: "#fff",
  },
};

function buyerStatusBadgeStyle(status, baseStyle) {
  if (status === "accepted") {
    return { ...baseStyle, background: "#dcfce7", borderColor: "#86efac", color: "#166534" };
  }
  if (status === "reserved") {
    return { ...baseStyle, background: "#fef3c7", borderColor: "#fcd34d", color: "#92400e" };
  }
  if (status === "sold") {
    return { ...baseStyle, background: "#fee2e2", borderColor: "#fca5a5", color: "#b91c1c" };
  }
  return baseStyle;
}

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const ANONYMOUS_SELLER_LABEL = "Anonyymi kalastaja";

function getPublicPickupLocation({ municipality, deliveryArea, area }) {
  const municipalityValue = String(municipality || "").trim();
  if (municipalityValue) return municipalityValue;

  const deliveryAreaValue = String(deliveryArea || "").trim();
  if (deliveryAreaValue) {
    const parts = deliveryAreaValue.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length > 1) return parts[parts.length - 1];
    return deliveryAreaValue;
  }

  return String(area || "").trim() || "-";
}

async function findAllowedUsersByEmail(supabase, email) {
  const normalizedEmail = normalizeEmail(email);
  const { data, error } = await supabase
    .from("allowed_users")
    .select("*")
    .ilike("email", normalizedEmail);

  if (error) return { data: [], error };

  const matches = (data || []).filter((row) => normalizeEmail(row.email) === normalizedEmail);
  return { data: matches, error: null };
}

async function findAllowedUserByEmail(supabase, email) {
  const { data, error } = await findAllowedUsersByEmail(supabase, email);
  return { data: (data || [])[0] || null, error };
}

function roleLabel(role) {
  if (role === "owner") return "Omistaja";
  if (role === "buyer") return "Ostaja";
  if (role === "processor") return "Jalostaja";
  return "Kalastaja";
}

function buildRoleOptionLabel(option, buyers = []) {
  if (option.role === "buyer") {
    const linkedBuyer = buyers.find((buyer) => buyer.id === option.buyer_id);
    return linkedBuyer?.company_name ? `Ostaja · ${linkedBuyer.company_name}` : "Ostaja";
  }
  return roleLabel(option.role);
}

function responsiveGridStyle(base) {
  if (typeof window !== "undefined" && window.innerWidth < 960) {
    return { ...base, gridTemplateColumns: "1fr" };
  }
  return base;
}

function MunicipalitySelect({ value, onChange, placeholder = "Valitse paikkakunta" }) {
  return (
    <select style={styles.input} value={value} onChange={onChange}>
      <option value="">{placeholder}</option>
      {finlandMunicipalities.map((municipality) => (
        <option key={municipality} value={municipality}>
          {municipality}
        </option>
      ))}
    </select>
  );
}

function PublicBatchView({ batchId, data, loading, error }) {
  const headerSummary = [formatSpeciesForSale(data?.species), data?.quantity != null && data?.quantity !== "" ? `${data.quantity} ${data.unit || "kg"}` : ""]
    .filter(Boolean)
    .join(" · ");
  const infoRows = [
    ["Erätunnus", data?.batch_id],
    ["Tila", data?.status],
    ["Laji", formatSpeciesForSale(data?.species)],
    ["Tuote", data?.product_name],
    ["Käsittelymenetelmä", data?.processing_method],
    ["Pyyntipäivämäärä", data?.catch_date],
    ["Tuotantopäivä", data?.production_date],
    ["Parasta ennen", data?.best_before_date],
    ["Alue", data?.area],
    ["Paikka", [data?.municipality, data?.spot].filter(Boolean).join(" / ")],
    ["Pyydys", data?.gear],
    ["Määrä", data?.quantity != null && data?.quantity !== "" ? `${data.quantity} ${data.unit || "kg"}` : ""],
    ["Myyjä / jalostaja", data?.seller_name],
    ["Luotu", data?.created_at ? new Date(data.created_at).toLocaleString("fi-FI") : ""],
  ].filter(([, value]) => value);

  const saleRows = [
    ["Myyntitila", data?.sale_info?.status],
    ["Tarjouksia", data?.sale_info?.offer_count],
    ["Viimeisin päivitys", data?.sale_info?.updated_at ? new Date(data.sale_info.updated_at).toLocaleString("fi-FI") : ""],
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");

  const processingRows = [
    ["Tuotetyyppi", data?.related_processing?.product_type],
    ["Pakkauskoko", data?.related_processing?.package_size_g ? `${data.related_processing.package_size_g} g` : ""],
    ["Pakkausten määrä", data?.related_processing?.package_count],
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");

  return (
    <div style={styles.app}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .print-card { box-shadow: none !important; border-color: #cbd5e1 !important; break-inside: avoid; }
        }
      `}</style>
      <div style={{ ...styles.container, maxWidth: 960 }}>
        <div style={{ ...styles.card, ...styles.headerCard, marginBottom: 16, background: "linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)" }} className="print-card">
          <div style={styles.rowBetween}>
            <div>
              <div style={{ fontSize: 14, color: "#1d4ed8", fontWeight: 700, marginBottom: 6 }}>Erän jäljitettävyys</div>
              <h1 style={{ ...styles.title, marginBottom: 8 }}>Batch information</h1>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{batchId}</div>
              {headerSummary ? <div style={{ marginTop: 8, fontSize: 18, color: "#0f172a", fontWeight: 700 }}>{headerSummary}</div> : null}
            </div>
            <div className="no-print" style={styles.row}>
              <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => window.print()}>
                Print batch information
              </button>
            </div>
          </div>
        </div>

        {loading ? <div style={{ ...styles.card, ...styles.sectionCard }} className="print-card">Haetaan erän tietoja...</div> : null}
        {error ? <div style={{ ...styles.noticeError, marginBottom: 16 }}>{error}</div> : null}

        {!loading && !error && data ? (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }} className="print-card">
              <strong style={{ fontSize: 20 }}>Erän perustiedot</strong>
              {infoRows.map(([label, value]) => (
                <div key={label} style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 12, borderBottom: "1px solid #e2e8f0", paddingBottom: 8 }}>
                  <div style={{ color: "#475569", fontWeight: 600 }}>{label}</div>
                  <div style={{ color: "#0f172a" }}>{String(value)}</div>
                </div>
              ))}
            </div>

            {data?.species_summary || data?.notes ? (
              <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }} className="print-card">
                <strong style={{ fontSize: 20 }}>Sisältö ja lisätiedot</strong>
                {data?.species_summary ? <div style={{ whiteSpace: "pre-wrap", color: "#0f172a" }}>{formatSpeciesSummaryText(data.species_summary)}</div> : null}
                {data?.notes ? <div style={{ whiteSpace: "pre-wrap", color: "#475569" }}>{data.notes}</div> : null}
              </div>
            ) : null}

            {processingRows.length > 0 ? (
              <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }} className="print-card">
                <strong style={{ fontSize: 20 }}>Jalostustiedot</strong>
                {processingRows.map(([label, value]) => (
                  <div key={label} style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 12, borderBottom: "1px solid #e2e8f0", paddingBottom: 8 }}>
                    <div style={{ color: "#475569", fontWeight: 600 }}>{label}</div>
                    <div style={{ color: "#0f172a" }}>{String(value)}</div>
                  </div>
                ))}
              </div>
            ) : null}

            {Array.isArray(data?.source_batches) && data.source_batches.length > 0 ? (
              <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }} className="print-card">
                <strong style={{ fontSize: 20 }}>Raaka-aine-erät</strong>
                {data.source_batches.map((source) => (
                  <div key={`${source.batch_id}-${source.source_entry_id || source.species || Math.random()}`} style={{ ...styles.entry, background: "#f8fbff" }}>
                    <div style={styles.rowBetween}>
                      <div style={{ ...styles.stack, gap: 6 }}>
                        <div><strong>Erätunnus:</strong> {source.batch_id || "-"}</div>
                        <div style={styles.muted}><strong>Laji:</strong> {formatSpeciesForSale(source.species)}</div>
                        {source.catch_date ? <div style={styles.muted}><strong>Pyyntipäivämäärä:</strong> {source.catch_date}</div> : null}
                        <div style={styles.muted}><strong>Määrä:</strong> {source.kilos != null && source.kilos !== "" ? `${source.kilos} kg` : "-"}</div>
                      </div>
                      {source.qr_image_url ? (
                        <div className="no-print" style={styles.qrBlock}>
                          <img src={source.qr_image_url} alt={`QR ${source.batch_id || "source"}`} style={styles.qrImage} />
                          <div style={styles.small}>QR-koodi lähde-erälle</div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {saleRows.length > 0 ? (
              <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }} className="print-card">
                <strong style={{ fontSize: 20 }}>Myynti / tarjous</strong>
                {saleRows.map(([label, value]) => (
                  <div key={label} style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 12, borderBottom: "1px solid #e2e8f0", paddingBottom: 8 }}>
                    <div style={{ color: "#475569", fontWeight: 600 }}>{label}</div>
                    <div style={{ color: "#0f172a" }}>{String(value)}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

      </div>
    </div>
  );
}

function CatchLabelPrintModal({ entry, profile, labelCount, setLabelCount, onClose, onGeneratePdf, onPrint }) {
  if (!entry) return null;

  const previewLabel = buildCatchLabelData(entry, profile, 1, Math.max(1, Number(labelCount || 1)));
  const previewQrImageUrl = getCatchLabelQrImageUrl(previewLabel);
  const previewLogoUrl = getAppLogoUrl();

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(15, 23, 42, 0.45)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
      zIndex: 2000,
    }}>
      <div style={{ ...styles.card, width: "min(980px, 100%)", maxHeight: "90vh", overflow: "auto", padding: 24 }}>
        <div style={styles.rowBetween}>
          <div>
            <strong style={{ fontSize: 22 }}>Tulosta etiketit</strong>
            <div style={styles.muted}>Erätunnus: {entry.batchId}</div>
          </div>
          <button style={styles.button} onClick={onClose}>Sulje</button>
        </div>

        <div style={{ ...styles.grid2, marginTop: 16, alignItems: "start" }}>
          <div style={{ ...styles.stack, gap: 14 }}>
            <div style={styles.field}>
              <label>Kalalaji</label>
              <input style={styles.input} value={formatSpeciesForSale(entry.species)} disabled />
            </div>
            <div style={styles.field}>
              <label>Pyyntipäivämäärä</label>
              <input style={styles.input} value={entry.date || "-"} disabled />
            </div>
            <div style={styles.field}>
              <label>Erätunnus</label>
              <input style={styles.input} value={entry.batchId || "-"} disabled />
            </div>
            <div style={styles.field}>
              <label>Laatikoiden määrä</label>
              <input
                style={styles.input}
                type="number"
                min="1"
                step="1"
                value={labelCount}
                onChange={(e) => setLabelCount(Math.max(1, Number(e.target.value || 1)))}
              />
            </div>
            <div style={styles.small}>APLI 1278 · 57 × 105 mm · 10 etikettiä / arkki. “Luo PDF” avaa tulostusikkunan, jossa voit tallentaa PDF:n.</div>
            <div style={styles.row}>
              <button style={{ ...styles.button, ...styles.primaryButton }} onClick={onGeneratePdf}>Luo PDF</button>
              <button style={styles.button} onClick={onPrint}>Tulosta</button>
            </div>
          </div>

          <div style={{ ...styles.card, background: "#f8fbff", padding: 18 }}>
            <div style={{ ...styles.small, marginBottom: 10 }}>Esikatselu</div>
            <div style={{
              width: 420,
              maxWidth: "100%",
              aspectRatio: "105 / 57",
              background: "#fff",
              padding: 14,
              display: "grid",
              gridTemplateColumns: "1fr 96px",
              gap: 12,
            }}>
              <div style={{ display: "flex", flexDirection: "column", paddingLeft: 12, minWidth: 0 }}>
                <div>
                  <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.03 }}>{previewLabel.species}</div>
                  {previewLabel.scientificName ? <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>{previewLabel.scientificName}</div> : null}
                  <div style={{ marginTop: 8, fontSize: 14, fontWeight: 800, padding: "6px 8px", background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: 8 }}>Erätunnus: {previewLabel.batchId}</div>
                  {previewLabel.catchArea ? <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.12 }}>Pyyntialue: {previewLabel.catchArea}</div> : null}
                  {previewLabel.gearType ? <div style={{ fontSize: 12, lineHeight: 1.12 }}>Pyyntimenetelmä: {previewLabel.gearType}</div> : null}
                  {previewLabel.catchDate ? <div style={{ fontSize: 12, lineHeight: 1.12 }}>Pyyntipäivä: {previewLabel.catchDate}</div> : null}
                  {previewLabel.productForm ? <div style={{ fontSize: 12, lineHeight: 1.12 }}>Tuote: {previewLabel.productForm}</div> : null}
                  <div style={{ fontSize: 12, lineHeight: 1.12 }}>Säilytys: 0–2 °C</div>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginTop: 12, minHeight: 24 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>Paino:</span>
                  <span style={{ flex: 1, borderBottom: "2px solid #0f172a", height: 18 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>kg</span>
                </div>
                <div style={{ marginTop: "auto", fontSize: 12, lineHeight: 1.12 }}>
                  <div>Toimittaja: {previewLabel.supplier}</div>
                  {previewLabel.supplierAddress ? <div>{previewLabel.supplierAddress}</div> : null}
                  {previewLabel.supplierContact ? <div>{previewLabel.supplierContact}</div> : null}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 4 }}>
                  <img src={previewLogoUrl} alt="Suoraan Kalastajalta" style={{ width: 48, height: 48, objectFit: "contain", marginBottom: 4 }} />
                  <div style={{ fontSize: 10, lineHeight: 1.05, fontWeight: 700, textAlign: "center", color: "#0f172a" }}>
                    <div>Suoraan</div>
                    <div>Kalastajalta</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-start", width: "100%" }}>
                  <img src={previewQrImageUrl} alt={`QR ${previewLabel.batchId}`} style={{ width: 82, height: 82, objectFit: "contain", border: "1px solid #cbd5e1", borderRadius: 8, padding: 4, background: "#fff" }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AuthView({ authMode, setAuthMode, authForm, setAuthForm, onSignIn, onSignUp, onForgotPassword, onResetRecoveredPassword, authError, authInfo }) {
  return (
    <div style={styles.app}>
      <div style={{ ...styles.container, maxWidth: 520 }}>
        <form
          style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}
          onSubmit={(e) => {
            e.preventDefault();
            if (authMode === "signin") {
              onSignIn();
            } else if (authMode === "recovery") {
              onResetRecoveredPassword();
            } else {
              onSignUp();
            }
          }}
        >
          <h1 style={styles.title}>Suoraan Kalastajalta</h1>
          {authMode !== "recovery" ? (
            <div style={{ ...styles.tabs6, gridTemplateColumns: "1fr 1fr", marginBottom: 0 }}>
              <button type="button" style={{ ...styles.tab, ...(authMode === "signin" ? styles.activeTab : {}) }} onClick={() => setAuthMode("signin")}>Kirjaudu</button>
              <button type="button" style={{ ...styles.tab, ...(authMode === "signup" ? styles.activeTab : {}) }} onClick={() => setAuthMode("signup")}>Rekisteröidy</button>
            </div>
          ) : (
            <div style={{ ...styles.card, padding: "12px 16px", background: "#eff6ff", border: "1px solid #93c5fd" }}>
              <strong>Aseta uusi salasana</strong>
              <div style={styles.muted}>Avaa sähköpostista tullut palautuslinkki ja aseta tähän uusi salasana.</div>
            </div>
          )}

          <div style={styles.field}>
            <label>Sähköposti</label>
            <input style={styles.input} type="email" value={authForm.email} onChange={(e) => setAuthForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="esim. nimi@yritys.fi" disabled={authMode === "recovery"} />
          </div>

          <div style={styles.field}>
            <label>{authMode === "recovery" ? "Uusi salasana" : "Salasana"}</label>
            <input style={styles.input} type="password" value={authForm.password} onChange={(e) => setAuthForm((prev) => ({ ...prev, password: e.target.value }))} placeholder={authMode === "recovery" ? "vähintään 8 merkkiä" : "salasana"} />
          </div>

          {authMode === "signup" ? (
            <>
              <div style={styles.field}>
                <label>Nimi</label>
                <input style={styles.input} value={authForm.displayName} onChange={(e) => setAuthForm((prev) => ({ ...prev, displayName: e.target.value }))} placeholder="Esim. Joonas Häkkinen" />
              </div>
              <div style={styles.field}>
                <label>Rooli</label>
                <select style={styles.input} value={authForm.requestedRole} onChange={(e) => setAuthForm((prev) => ({ ...prev, requestedRole: e.target.value }))}>
                  <option value="member">Kalastaja</option>
                  <option value="processor">Jalostaja</option>
                  <option value="buyer">Ostaja</option>
                </select>
              </div>
            </>
          ) : null}

          {authMode === "recovery" ? (
            <div style={styles.field}>
              <label>Uusi salasana uudelleen</label>
              <input style={styles.input} type="password" value={authForm.confirmPassword} onChange={(e) => setAuthForm((prev) => ({ ...prev, confirmPassword: e.target.value }))} placeholder="kirjoita uusi salasana uudelleen" />
            </div>
          ) : null}

          {authError ? <div style={styles.noticeError}>{authError}</div> : null}
          {authInfo ? <div style={styles.noticeSuccess}>{authInfo}</div> : null}

          {authMode === "signin" ? (
            <>
              <button type="submit" style={{ ...styles.button, ...styles.primaryButton }}>Kirjaudu sisään</button>
              <button type="button" style={styles.button} onClick={onForgotPassword}>Unohditko salasanan?</button>
            </>
          ) : authMode === "recovery" ? (
            <button type="submit" style={{ ...styles.button, ...styles.primaryButton }}>Tallenna uusi salasana</button>
          ) : (
            <button type="submit" style={{ ...styles.button, ...styles.primaryButton }}>Luo tunnus</button>
          )}

          {authMode === "signup" ? <div style={styles.muted}>Rekisteröitymisen jälkeen owner hyväksyy käyttöoikeuden ennen kuin appi avautuu.</div> : null}

        </form>
      </div>
    </div>
  );
}

function RoleSelectionView({ roleOptions, buyers, onSelectRole }) {
  return (
    <div style={styles.app}>
      <div style={{ ...styles.container, maxWidth: 560 }}>
        <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
          <h1 style={styles.title}>Valitse rooli</h1>
          <div style={styles.muted}>Tällä sähköpostilla on useita rooleja. Valitse millä roolilla haluat jatkaa.</div>
          <div style={{ ...styles.stack, marginTop: 8 }}>
            {roleOptions.map((option) => (
              <button
                key={option.id}
                style={{ ...styles.button, ...styles.primaryButton, justifyContent: "space-between", width: "100%" }}
                onClick={() => onSelectRole(option)}
              >
                <span>{buildRoleOptionLabel(option, buyers)}</span>
                <span>{option.display_name || option.email}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PendingApprovalView({ profile, onLogout }) {
  return (
    <div style={styles.app}>
      <div style={{ ...styles.container, maxWidth: 560 }}>
        <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
          <h1 style={styles.title}>Odottaa hyväksyntää</h1>
          <div style={styles.muted}>
            Tunnus on luotu sähköpostille <strong>{profile?.email || "-"}</strong>, mutta ownerin pitää vielä hyväksyä käyttöoikeus ennen kuin appi aukeaa.
          </div>
          <div style={styles.noticeInfo}>
            Valittu rooli: <strong>{roleLabel(profile?.role || "member")}</strong>
          </div>
          <div style={{ ...styles.row, justifyContent: "flex-end" }}>
            <button style={styles.button} onClick={onLogout}>Kirjaudu ulos</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function WholesaleOffersView({
  profile,
  saleEntries,
  offers,
  buyerOffers,
  offerForm,
  setOfferForm,
  onCreateOffer,
  onUpdateOfferStatus,
  onUpdateBuyerOfferStatus,
  updateFulfillmentStatus,
  requestedOfferId,
  buyerTypeLabel,
  buyerStatusLabel,
  shouldRevealBuyerIdentity,
}) {
  const formatOfferDate = (value) => {
    if (!value) return "-";
    try {
      return new Date(value).toLocaleString("fi-FI", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return value;
    }
  };

  const getEntryReservation = (entry) => {
    const matches = (buyerOffers || []).filter((offer) => {
      if (offer.status !== "reserved" && offer.status !== "accepted") {
        return false;
      }

      if (offer.batch_id && entry.batchId) {
        return offer.batch_id === entry.batchId;
      }

      return (
        offer.seller_user_id === entry.ownerUserId &&
        offer.area === entry.area &&
        offer.spot === (entry.spot || "") &&
        Number(offer.total_kilos || 0) === Number(entry.kilos || 0)
      );
    });

    if (matches.length === 0) return null;

    return matches.sort(
      (a, b) =>
        new Date(b.updated_at || b.created_at || 0).getTime() -
        new Date(a.updated_at || a.created_at || 0).getTime()
    )[0];
  };

  const groupedBuyerOffers = saleEntries.map((entry) => {
    const reservation = getEntryReservation(entry);

    const batchMatches = (buyerOffers || []).filter(
      (offer) => offer.batch_id && entry.batchId && offer.batch_id === entry.batchId
    );

    const entryMatches = (buyerOffers || []).filter((offer) => {
      if (offer.batch_id && entry.batchId) return false;

      return (
        offer.seller_user_id === entry.ownerUserId &&
        offer.area === entry.area &&
        offer.spot === (entry.spot || "") &&
        Number(offer.total_kilos || 0) === Number(entry.kilos || 0)
      );
    });

    return {
      entry,
      reservation,
      entryOffers: offers.filter((offer) => offer.entry_id === entry.id),
      buyerMatches: [...batchMatches, ...entryMatches].sort(
        (a, b) =>
          new Date(b.updated_at || b.created_at || 0).getTime() -
          new Date(a.updated_at || a.created_at || 0).getTime()
      ),
    };
  });

  const buyerResponsePriority = {
    reserved: 0,
    countered: 1,
    accepted: 2,
    rejected: 3,
  };

  const prioritizedBuyerResponses = (buyerOffers || [])
    .filter((offer) => ["countered", "reserved", "accepted", "rejected"].includes(offer.status))
    .sort((a, b) => {
      if (requestedOfferId) {
        if (a.id === requestedOfferId && b.id !== requestedOfferId) return -1;
        if (b.id === requestedOfferId && a.id !== requestedOfferId) return 1;
      }
      const priorityDiff = (buyerResponsePriority[a.status] ?? 99) - (buyerResponsePriority[b.status] ?? 99);
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime();
    });

  const canManageBuyerOffer = (offer) => profile?.role === "owner" || profile?.id === offer?.seller_user_id;
  const linkedBuyerOffer = requestedOfferId
    ? (buyerOffers || []).find((offer) => offer.id === requestedOfferId)
    : null;

  return (
    <div style={styles.stack}>
      {linkedBuyerOffer ? (
        <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack, background: "#eff6ff", borderColor: "#93c5fd" }}>
          <div style={styles.rowBetween}>
            <strong>Avattu linkistä</strong>
            <span style={{ ...styles.badge, background: "#dbeafe", borderColor: "#93c5fd", color: "#1d4ed8" }}>{buyerStatusLabel(linkedBuyerOffer.status)}</span>
          </div>
          <div style={styles.muted}><strong>Erä:</strong> {formatSpeciesSummaryText(linkedBuyerOffer.species_summary) || "-"}</div>
          {getOfferSummaryCatchDates(linkedBuyerOffer.species_summary).length > 0 ? <div style={styles.muted}><strong>Pyyntipäivämäärä:</strong> {getOfferSummaryCatchDates(linkedBuyerOffer.species_summary).join(", ")}</div> : null}
          {isMixedOffer(linkedBuyerOffer)
            ? getOfferSummaryBatchItems(linkedBuyerOffer.species_summary).map((item) => (
              <div key={`${linkedBuyerOffer.id}-${item.batchId || item.label}`} style={{ ...styles.entry, background: "#fff", padding: 12 }}>
                <div style={styles.muted}><strong>{item.label || "Erä"}</strong></div>
                {item.catchDate ? <div style={styles.muted}><strong>Pyyntipäivämäärä:</strong> {item.catchDate}</div> : null}
                {item.batchId ? <div style={styles.muted}><strong>Erätunnus:</strong> {item.batchId}</div> : null}
                {item.batchId ? <div style={{ ...styles.qrBlock, marginTop: 8 }}><img src={getBatchQrImageUrl(item.batchId)} alt={`QR ${item.batchId}`} style={styles.qrImage} /><div style={styles.small}>QR-koodi erälle</div></div> : null}
              </div>
            ))
            : (
              <>
                {getOfferSummaryBatchItems(linkedBuyerOffer.species_summary)[0]?.catchDate ? <div style={styles.muted}><strong>Pyyntipäivämäärä:</strong> {getOfferSummaryBatchItems(linkedBuyerOffer.species_summary)[0].catchDate}</div> : null}
                {linkedBuyerOffer.batch_id ? <div style={styles.muted}><strong>Erätunnus:</strong> {linkedBuyerOffer.batch_id}</div> : null}
              </>
            )}
          <div style={styles.muted}><strong>Ostaja:</strong> {shouldRevealBuyerIdentity(linkedBuyerOffer.status) ? (linkedBuyerOffer.buyer_company_name || linkedBuyerOffer.buyer_email || "Ostaja") : buyerTypeLabel(linkedBuyerOffer.buyer_type)}</div>
          {linkedBuyerOffer.buyer_message ? <div style={styles.muted}><strong>Viesti:</strong> {linkedBuyerOffer.buyer_message}</div> : null}
          <div style={styles.muted}>Tarjous näkyy myös alempana ostajien vastauksissa ja erän omassa tarjouslistassa.</div>
        </div>
      ) : null}

      <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
        <strong>Ostajien vastaukset ja varaukset</strong>
        <div style={styles.noticeInfo}>Tässä näkyvät ensin ostajien varaukset ja vastatarjoukset. Näin näet heti, mihin eriin pitää reagoida. Hyväksytyt ja hylätyt näkyvät niiden jälkeen.</div>
        {prioritizedBuyerResponses.length === 0 ? (
          <div style={styles.muted}>Ei vielä ostajien vastauksia.</div>
        ) : (
          prioritizedBuyerResponses.slice(0, 20).map((offer) => {
            const isAccepted = offer.status === "accepted";
            const isReserved = offer.status === "reserved";
            const isCountered = offer.status === "countered";
            const revealIdentity = shouldRevealBuyerIdentity(offer.status);
            const isLinkedOffer = requestedOfferId && offer.id === requestedOfferId;
            return (
              <div
                key={offer.id}
                style={{
                  ...styles.entry,
                  background: isLinkedOffer ? "#eff6ff" : isAccepted ? "#ecfeff" : isReserved ? "#eff6ff" : isCountered ? "#f8fbff" : "#fff",
                  borderLeft: `4px solid ${isLinkedOffer ? "#1d4ed8" : isAccepted ? "#0891b2" : isReserved ? "#2563eb" : isCountered ? "#0ea5e9" : "#0f172a"}`,
                }}
              >
                <div style={{ ...styles.rowBetween, marginBottom: 8 }}>
                  <strong>{formatOfferDate(offer.updated_at || offer.created_at)}</strong>
                  <div style={styles.entryBadges}>
                    {isLinkedOffer ? <span style={{ ...styles.badge, background: "#dbeafe", borderColor: "#93c5fd", color: "#1d4ed8" }}>Avattu linkistä</span> : null}
                    <span style={buyerStatusBadgeStyle(offer.status, styles.badge)}>{buyerStatusLabel(offer.status)}</span>
                    <span style={styles.badge}>{revealIdentity ? (offer.buyer_company_name || offer.buyer_email || "Ostaja") : buyerTypeLabel(offer.buyer_type)}</span>
                  </div>
                </div>
                <div>
                  <div style={styles.muted}><strong>Erä:</strong> {formatSpeciesSummaryText(offer.species_summary) || "-"}</div>
                  {getOfferSummaryCatchDates(offer.species_summary).length > 0 ? <div style={styles.muted}><strong>Pyyntipäivämäärä:</strong> {getOfferSummaryCatchDates(offer.species_summary).join(", ")}</div> : null}
                  {isMixedOffer(offer)
                    ? getOfferSummaryBatchItems(offer.species_summary).map((item) => (
                      <div key={`${offer.id}-${item.batchId || item.label}`} style={{ ...styles.entry, background: "#fff", padding: 12, marginTop: 8, marginBottom: 8 }}>
                        <div style={styles.muted}><strong>{item.label || "Erä"}</strong></div>
                        {item.catchDate ? <div style={styles.muted}><strong>Pyyntipäivämäärä:</strong> {item.catchDate}</div> : null}
                        {item.batchId ? <div style={styles.muted}><strong>Erätunnus:</strong> {item.batchId}</div> : null}
                        {item.batchId ? <div style={{ ...styles.qrBlock, marginTop: 8 }}><img src={getBatchQrImageUrl(item.batchId)} alt={`QR ${item.batchId}`} style={styles.qrImage} /><div style={styles.small}>QR-koodi erälle</div></div> : null}
                      </div>
                    ))
                    : (
                      <>
                        {getOfferSummaryBatchItems(offer.species_summary)[0]?.catchDate ? <div style={styles.muted}><strong>Pyyntipäivämäärä:</strong> {getOfferSummaryBatchItems(offer.species_summary)[0].catchDate}</div> : null}
                        {offer.batch_id ? <div style={styles.muted}><strong>Erätunnus:</strong> {offer.batch_id}</div> : null}
                      </>
                    )}
                  {!isMixedOffer(offer) && offer.batch_id ? <div style={{ ...styles.qrBlock, marginTop: 8, marginBottom: 8 }}><img src={getBatchQrImageUrl(offer.batch_id)} alt={`QR ${offer.batch_id}`} style={styles.qrImage} /><div style={styles.small}>QR-koodi erälle</div></div> : null}
                  <div style={styles.muted}><strong>Määrä:</strong> {offer.total_kilos} kg</div>
                  {offer.counter_price_per_kg !== "" && offer.counter_price_per_kg != null ? <div style={styles.muted}><strong>Vastatarjous:</strong> {euro(offer.counter_price_per_kg)} / kg</div> : null}
                  {offer.reserved_kilos !== "" && offer.reserved_kilos != null ? <div style={styles.muted}><strong>Varattu:</strong> {offer.reserved_kilos} kg</div> : null}
                  {offer.buyer_message ? <div style={styles.muted}><strong>Viesti:</strong> {offer.buyer_message}</div> : null}
                  {revealIdentity ? <div style={styles.muted}><strong>Yhteystiedot:</strong> {offer.buyer_contact_name || "-"} · {offer.buyer_email || "-"}{offer.buyer_phone ? ` · ${offer.buyer_phone}` : ""}</div> : null}
                  {offer.status === "accepted" ? <div style={styles.muted}><strong>Laskutus:</strong> tämä kauppa siirtyy ownerin laskutusnäkymään kuukausikohtaisesti.</div> : null}
                  {canManageBuyerOffer(offer) && offer.status !== "accepted" && offer.status !== "rejected" ? (
                    <div style={{ ...styles.row, marginTop: 12 }}>
                      <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => onUpdateBuyerOfferStatus(offer, "accepted")}>
                        {offer.status === "reserved" ? "Hyväksy varaus" : offer.status === "countered" ? "Hyväksy vastatarjous" : "Hyväksy kauppa"}
                      </button>
                      <button style={styles.button} onClick={() => onUpdateBuyerOfferStatus(offer, "rejected")}>Hylkää</button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
        <strong>Myyntiin merkityt erät</strong>

        {groupedBuyerOffers.length === 0 ? (
          <div style={styles.muted}>Ei vielä myyntiin merkittyjä eriä.</div>
        ) : (
          groupedBuyerOffers.map(({ entry, reservation, entryOffers, buyerMatches }) => (
            <div key={entry.id} style={styles.entry}>
              <div style={styles.entryHeader}>
                <div>
                  <div style={styles.entryBadges}>
                    <span style={styles.badge}>{formatSpeciesForSale(entry.species)}</span>
                    <span style={styles.badge}>{entry.kilos} kg</span>
                    <span style={styles.badge}>{entry.ownerName}</span>
                    {reservation?.status === "reserved" ? <span style={buyerStatusBadgeStyle("reserved", styles.badge)}>Varattu</span> : null}
                    {reservation?.status === "accepted" ? <span style={buyerStatusBadgeStyle("accepted", styles.badge)}>Myyty</span> : null}
                    {entry.offerToShops ? <span style={styles.badge}>Kauppoihin</span> : null}
                    {entry.offerToRestaurants ? <span style={styles.badge}>Ravintoloihin</span> : null}
                    {entry.offerToWholesalers ? <span style={styles.badge}>Tukkuihin</span> : null}
                  </div>
                  <div style={styles.muted}>{entry.date} · {entry.area}{entry.municipality ? ` · ${entry.municipality}` : ""}{entry.spot ? ` / ${entry.spot}` : ""}</div>
                  {entry.batchId ? <div style={styles.muted}>Erätunnus: {entry.batchId}</div> : null}
                  {entry.batchId ? <div style={styles.qrBlock}><img src={getBatchQrImageUrl(entry.batchId)} alt={`QR ${entry.batchId}`} style={styles.qrImage} /><div style={styles.small}>QR-koodi erälle</div></div> : null}
                  <div style={styles.muted}>Pyydys: {entry.gear || "-"}</div>
                  {reservation ? (
                    <div style={styles.muted}>
                      {reservation.status === "reserved"
                        ? `Erä on varattu. Varannut: ${shouldRevealBuyerIdentity(reservation.status) ? (reservation.buyer_company_name || reservation.buyer_email || "ostaja") : buyerTypeLabel(reservation.buyer_type)}`
                        : `Erä on myyty. Ostaja: ${shouldRevealBuyerIdentity(reservation.status) ? (reservation.buyer_company_name || reservation.buyer_email || "ostaja") : buyerTypeLabel(reservation.buyer_type)}`}
                    </div>
                  ) : null}
                  <div style={styles.muted}>Toimitus: {entry.deliveryMethod || "-"} · {entry.deliveryArea || "-"} · Kulu {entry.deliveryCost !== "" && entry.deliveryCost != null ? `${entry.deliveryCost} €` : "-"} · Aikaisin {entry.earliestDeliveryDate || "-"} · Kylmäkuljetus {entry.coldTransport ? "kyllä" : "ei"}</div>
                  {entry.commercialFishingId ? <div style={styles.muted}>Kaupallisen kalastajan tunnus: {entry.commercialFishingId}</div> : null}
                </div>
              </div>

              <div style={{ ...styles.stack, marginTop: 12 }}>
                <div style={styles.small}>Suorat tarjoukset tälle erälle: {entryOffers.length}</div>
                <div style={styles.small}>Tarjous lähetetty {buyerMatches.length} ostajalle</div>
                {reservation?.status === "reserved" ? <div style={styles.noticeInfo}>Erä on tällä hetkellä varattu. Voit hyväksyä varauksen tai hylätä sen ostajien vastauksista.</div> : null}
                {reservation?.status === "accepted" ? <div style={styles.noticeSuccess}>Erä on merkitty myydyksi hyväksytyn varauksen perusteella.</div> : null}
                {entryOffers.map((offer) => (
                  <div key={offer.id} style={{ ...styles.entry, background: "#f8fafc" }}>
                    <div style={styles.entryHeader}>
                      <div>
                        <div style={styles.entryBadges}>
                          <span style={styles.badge}>{offer.company_name}</span>
                          <span style={styles.badge}>{euro(offer.offer_price_per_kg)} / kg</span>
                          <span style={styles.badge}>{offer.contact_name}</span>
                          <span style={styles.badge}>{offer.status}</span>
                        </div>
                        <div style={styles.muted}>{offer.contact_email}{offer.contact_phone ? ` · ${offer.contact_phone}` : ""}</div>
                        {offer.message ? <div style={styles.muted}>{offer.message}</div> : null}
                      </div>
                      {profile?.role === "owner" || profile?.id === entry.ownerUserId ? (
                        <div style={styles.row}>
                          <button style={styles.button} onClick={() => onUpdateOfferStatus(offer, "accepted")}>Hyväksy</button>
                          <button style={styles.button} onClick={() => onUpdateBuyerOfferStatus(offer, "rejected")}>Hylkää</button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}

                <div style={styles.small}>Vastauksia: {buyerMatches.filter((offer) => ["countered", "reserved", "accepted", "rejected"].includes(offer.status)).length}</div>
                {buyerMatches.filter((offer) => ["countered", "reserved", "accepted", "rejected"].includes(offer.status)).length === 0 ? (
                  <div style={styles.muted}>Ei vielä ostajien vastauksia.</div>
                ) : (
                  buyerMatches
                    .filter((offer) => ["countered", "reserved", "accepted", "rejected"].includes(offer.status))
                    .sort((a, b) => {
                      if (requestedOfferId) {
                        if (a.id === requestedOfferId && b.id !== requestedOfferId) return -1;
                        if (b.id === requestedOfferId && a.id !== requestedOfferId) return 1;
                      }
                      return new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime();
                    })
                    .map((offer) => {
                    const isAccepted = offer.status === "accepted";
                    const revealIdentity = shouldRevealBuyerIdentity(offer.status);
                    const buyerIdentity = revealIdentity ? (offer.buyer_company_name || offer.buyer_email || "Ostaja") : buyerTypeLabel(offer.buyer_type);
                    const isLinkedOffer = requestedOfferId && offer.id === requestedOfferId;

                    return (
                      <div
                        key={offer.id}
                        style={{
                          ...styles.entry,
                          background: isLinkedOffer ? "#eff6ff" : isAccepted ? "#ecfdf5" : "#f8fafc",
                          borderLeft: `4px solid ${isLinkedOffer ? "#1d4ed8" : isAccepted ? "#16a34a" : "#0f172a"}`,
                        }}
                      >
                        <div style={{ ...styles.rowBetween, marginBottom: 10 }}>
                          <strong>{formatOfferDate(offer.updated_at || offer.created_at)}</strong>
                          <div style={styles.entryBadges}>
                            {isLinkedOffer ? <span style={{ ...styles.badge, background: "#dbeafe", borderColor: "#93c5fd", color: "#1d4ed8" }}>Avattu linkistä</span> : null}
                            <span style={buyerStatusBadgeStyle(offer.status, styles.badge)}>
                              {buyerStatusLabel(offer.status)}
                            </span>
                            <span style={styles.badge}>{buyerIdentity}</span>
                          </div>
                        </div>

                        <div style={{ ...styles.grid2, marginBottom: 10 }}>
                          <div>
                            <div style={styles.muted}><strong>Erä:</strong> {formatSpeciesSummaryText(offer.species_summary) || "-"}</div>
                            {getOfferSummaryCatchDates(offer.species_summary).length > 0 ? <div style={styles.muted}><strong>Pyyntipäivämäärä:</strong> {getOfferSummaryCatchDates(offer.species_summary).join(", ")}</div> : null}
                            {isMixedOffer(offer)
                              ? getOfferSummaryBatchItems(offer.species_summary).map((item) => (
                                <div key={`${offer.id}-${item.batchId || item.label}`} style={{ ...styles.entry, background: "#fff", padding: 12, marginTop: 8, marginBottom: 8 }}>
                                  <div style={styles.muted}><strong>{item.label || "Erä"}</strong></div>
                                  {item.catchDate ? <div style={styles.muted}><strong>Pyyntipäivämäärä:</strong> {item.catchDate}</div> : null}
                                  {item.batchId ? <div style={styles.muted}><strong>Erätunnus:</strong> {item.batchId}</div> : null}
                                  {item.batchId ? <div style={{ ...styles.qrBlock, marginTop: 8 }}><img src={getBatchQrImageUrl(item.batchId)} alt={`QR ${item.batchId}`} style={styles.qrImage} /><div style={styles.small}>QR-koodi erälle</div></div> : null}
                                </div>
                              ))
                              : (
                                <>
                                  {getOfferSummaryBatchItems(offer.species_summary)[0]?.catchDate ? <div style={styles.muted}><strong>Pyyntipäivämäärä:</strong> {getOfferSummaryBatchItems(offer.species_summary)[0].catchDate}</div> : null}
                                  {offer.batch_id ? <div style={styles.muted}><strong>Erätunnus:</strong> {offer.batch_id}</div> : null}
                                </>
                              )}
                            {!isMixedOffer(offer) && offer.batch_id ? <div style={{ ...styles.qrBlock, marginTop: 8, marginBottom: 8 }}><img src={getBatchQrImageUrl(offer.batch_id)} alt={`QR ${offer.batch_id}`} style={styles.qrImage} /><div style={styles.small}>QR-koodi erälle</div></div> : null}
                            <div style={styles.muted}><strong>Määrä:</strong> {offer.total_kilos} kg</div>
                            <div style={styles.muted}><strong>Alue:</strong> {offer.area || "-"}{entry.municipality ? ` · ${entry.municipality}` : ""}{offer.spot ? ` / ${offer.spot}` : ""}</div>
                          </div>
                          <div>
                            <div style={styles.muted}><strong>Vastatarjous:</strong> {offer.counter_price_per_kg !== "" && offer.counter_price_per_kg != null ? `${euro(offer.counter_price_per_kg)} / kg` : "-"}</div>
                            {offer.status === "accepted" ? <div style={styles.muted}><strong>Kaupan arvo:</strong> {euro(calculateCommissionDetails(offer).tradeValue)}</div> : null}
                            {offer.status === "accepted" ? <div style={styles.muted}><strong>Komissio ({(COMMISSION_RATE * 100).toFixed(1)} %):</strong> {euro(calculateCommissionDetails(offer).commissionValue)}</div> : null}
                            <div style={styles.muted}><strong>Varattu:</strong> {offer.reserved_kilos !== "" && offer.reserved_kilos != null ? `${offer.reserved_kilos} kg` : "-"}</div>
                            <div style={styles.muted}><strong>Pyydys:</strong> {entry.gear || "-"}</div>
                          </div>
                        </div>

                        <div style={{ ...styles.entry, background: "#fff", padding: 12, marginBottom: 10 }}>
                          <div style={styles.muted}><strong>Toimitus</strong></div>
                          <div style={styles.muted}>Tapa: {entry.deliveryMethod || "-"}</div>
                          <div style={styles.muted}>Alue: {entry.deliveryArea || "-"}</div>
                          <div style={styles.muted}>Kulu: {entry.deliveryCost !== "" && entry.deliveryCost != null ? `${entry.deliveryCost} €` : "-"}</div>
                          <div style={styles.muted}>Aikaisin toimitus: {entry.earliestDeliveryDate || "-"}</div>
                          <div style={styles.muted}>Kylmäkuljetus: {entry.coldTransport ? "kyllä" : "ei"}</div>
                        </div>

                        {offer.buyer_message ? (
                          <div style={{ ...styles.entry, background: "#fff", padding: 12, marginBottom: 10 }}>
                            <div style={styles.muted}><strong>Ostajan viesti</strong></div>
                            <div>{offer.buyer_message}</div>
                          </div>
                        ) : null}

                        {revealIdentity ? (
                          <div style={{ ...styles.entry, background: "#fff", padding: 12, marginBottom: 10 }}>
                            <div style={styles.muted}><strong>Yhteystiedot</strong></div>
                            <div>{offer.buyer_company_name || "-"}</div>
                            <div>{offer.buyer_contact_name || "-"}</div>
                            <div>{offer.buyer_email || "-"}{offer.buyer_phone ? ` · ${offer.buyer_phone}` : ""}</div>
                            {(offer.buyer_delivery_address || offer.buyer_delivery_postcode || offer.buyer_delivery_city) ? <div style={styles.muted}>Toimitusosoite: {[offer.buyer_delivery_address, offer.buyer_delivery_postcode, offer.buyer_delivery_city].filter(Boolean).join(", ")}</div> : null}
                            {(offer.buyer_billing_address || offer.buyer_billing_postcode || offer.buyer_billing_city || offer.buyer_billing_email) ? <div style={styles.muted}>Laskutus: {[offer.buyer_billing_address, offer.buyer_billing_postcode, offer.buyer_billing_city].filter(Boolean).join(", ")}{offer.buyer_billing_email ? ` · ${offer.buyer_billing_email}` : ""}</div> : null}
                            {offer.buyer_business_id ? <div style={styles.muted}>Y-tunnus: {offer.buyer_business_id}</div> : null}
                            <div style={styles.muted}>Toimituksen tila: {fulfillmentStatusLabel(offer.fulfillment_status)}</div>
                          </div>
                        ) : null}

                        {!revealIdentity && canManageBuyerOffer(offer) ? (
                          <div style={styles.row}>
                            {offer.status !== "accepted" ? <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => onUpdateBuyerOfferStatus(offer, "accepted")}>{offer.status === "reserved" ? "Hyväksy varaus" : offer.status === "countered" ? "Hyväksy vastatarjous" : "Hyväksy kauppa"}</button> : null}
                            {offer.status !== "rejected" ? <button style={styles.button} onClick={() => onUpdateBuyerOfferStatus(offer, "rejected")}>Hylkää</button> : null}
                          </div>
                        ) : null}
                        {revealIdentity && canManageBuyerOffer(offer) ? (
                          <div style={styles.row}>
                            {offer.fulfillment_status !== "delivery_agreed" ? <button style={styles.button} onClick={() => updateFulfillmentStatus(offer, "delivery_agreed")}>Merkitse toimitus sovituksi</button> : null}
                            {offer.fulfillment_status !== "delivered" ? <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => updateFulfillmentStatus(offer, "delivered")}>Merkitse toimitetuksi</button> : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}

                {reservation?.status === "accepted" ? null : (
                  <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack, marginTop: 8 }}>
                    <strong></strong>
                    </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ReportsView({ entries, processedEntries, offers }) {
  const reportRows = entries.map((entry) => [
    entry.date,
    entry.ownerName,
    entry.area,
    entry.municipality || "",
    entry.spot,
    entry.species,
    entry.kilos,
    entry.count,
    entry.gear,
    entry.deliveryMethod,
    entry.deliveryArea,
    entry.deliveryCost,
    entry.earliestDeliveryDate,
    entry.coldTransport ? "Kyllä" : "Ei",
    entry.notes,
  ]);

  const offerRows = offers.map((offer) => [
    offer.created_at || "",
    offer.company_name,
    offer.contact_name,
    offer.contact_email,
    offer.contact_phone,
    offer.offer_price_per_kg,
    offer.status,
    offer.message,
  ]);

  const processedRows = processedEntries.map((entry) => [
    entry.productionDate,
    entry.ownerName,
    entry.area,
    entry.municipality || "",
    entry.productName,
    entry.productType,
    entry.processingMethod,
    entry.speciesSummary,
    entry.kilos,
    entry.packageSizeG,
    entry.packageCount,
    entry.bestBeforeDate,
    entry.deliveryMethod,
    entry.deliveryArea,
    entry.deliveryCost,
    entry.earliestDeliveryDate,
    entry.coldTransport ? "Kyllä" : "Ei",
    entry.notes,
  ]);

  const totalKg = entries.reduce((sum, entry) => sum + Number(entry.kilos || 0), 0);
  const totalProcessedKg = processedEntries.reduce((sum, entry) => sum + Number(entry.kilos || 0), 0);
  const saleCount = entries.filter((entry) => entry.offerToShops || entry.offerToRestaurants || entry.offerToWholesalers).length;
  const processedSaleCount = processedEntries.filter((entry) => entry.offerToShops || entry.offerToRestaurants || entry.offerToWholesalers).length;

  return (
    <div style={styles.grid2}>
      <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
        <strong>Excel-raportit</strong>
        <div style={styles.noticeInfo}>Raportit ladataan CSV-muodossa, joka aukeaa suoraan Excelissä.</div>
        <button
          style={{ ...styles.button, ...styles.primaryButton }}
          onClick={() => exportCsv(`saaliit-${today()}.csv`, [["Pyyntipäivämäärä", "Kirjaaja", "Vesialue", "Paikkakunta", "Pyyntipaikka", "Laji", "Kg", "Kpl", "Pyydys", "Toimitustapa", "Toimitusalue", "Toimituskustannus €", "Aikaisin toimitus", "Kylmäkuljetus", "Lisätiedot"], ...reportRows])}
        >
          Lataa saalisraportti Exceliin
        </button>
        <button
          style={styles.button}
          onClick={() => exportCsv(`tarjoukset-${today()}.csv`, [["Pvm", "Yritys", "Yhteyshenkilö", "Sähköposti", "Puhelin", "Tarjous €/kg", "Tila", "Viesti"], ...offerRows])}
        >
          Lataa tarjousraportti Exceliin
        </button>
        <button
          style={styles.button}
          onClick={() => exportCsv(`jaloste-erat-${today()}.csv`, [["Tuotantopäivä", "Kirjaaja", "Vesialue", "Paikkakunta", "Tuotenimi", "Tuotetyyppi", "Käsittely", "Lajiyhteenveto", "Kg", "Pakkauskoko g", "Pakkausten määrä", "Parasta ennen", "Toimitustapa", "Toimitusalue", "Toimituskustannus €", "Aikaisin toimitus", "Kylmäkuljetus", "Lisätiedot"], ...processedRows])}
        >
          Lataa jaloste-erät Exceliin
        </button>
      </div>

      <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
        <strong>Raporttiyhteenveto</strong>
        <div style={styles.entryBadges}>
          <span style={styles.badge}>{totalKg.toFixed(1)} kg raakasaalista</span>
          <span style={styles.badge}>{totalProcessedKg.toFixed(1)} kg jalosteita</span>
          <span style={styles.badge}>{saleCount} saaliserää myynnissä</span>
          <span style={styles.badge}>{processedSaleCount} jaloste-erää myynnissä</span>
          <span style={styles.badge}>{offers.length} tarjousta</span>
        </div>
        <div style={styles.muted}>Raportit sisältävät kaikki tällä hetkellä näkyvät erät ja tarjoukset.</div>
      </div>
    </div>
  );
}

function BillingView({ buyerOffers, buyerStatusLabel, shouldRevealBuyerIdentity, billingFilter, setBillingFilter, onUpdateBillingStatus }) {
  const acceptedOffers = (buyerOffers || []).filter((offer) => {
    if (offer.status !== "accepted") return false;
    if (billingFilter === "all") return true;
    return (offer.billing_status || "unbilled") === billingFilter;
  });

  const grouped = acceptedOffers.reduce((acc, offer) => {
    const dateValue = offer.updated_at || offer.created_at || new Date().toISOString();
    const monthKey = (() => {
      try {
        const d = new Date(dateValue);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      } catch {
        return "Ei kuukautta";
      }
    })();

    const sellerKey = offer.seller_user_id || offer.seller_name || "Tuntematon myyjä";
    const sellerLabel = offer.seller_name || "Tuntematon myyjä";
    const buyerLabel = shouldRevealBuyerIdentity(offer.status)
      ? (offer.buyer_company_name || offer.buyer_email || "Ostaja")
      : "Anonyymi ostaja";
    const kilos = Number(offer.reserved_kilos || offer.total_kilos || 0);
    const pricePerKg = Number(offer.counter_price_per_kg || offer.price_per_kg || 0);
    const tradeValue = kilos * pricePerKg;
    const commissionValue = tradeValue * COMMISSION_RATE;
    const groupKey = `${monthKey}__${sellerKey}`;

    if (!acc[groupKey]) {
      acc[groupKey] = {
        monthKey,
        sellerKey,
        sellerLabel,
        offers: [],
        totalKilos: 0,
        totalTradeValue: 0,
        totalCommissionValue: 0,
      };
    }

    acc[groupKey].offers.push({
      ...offer,
      buyerLabel,
      billingKilos: kilos,
      billingPricePerKg: pricePerKg,
      tradeValue,
      commissionValue,
    });
    acc[groupKey].totalKilos += kilos;
    acc[groupKey].totalTradeValue += tradeValue;
    acc[groupKey].totalCommissionValue += commissionValue;
    return acc;
  }, {});

  const groups = Object.values(grouped).sort((a, b) => {
    if (a.monthKey === b.monthKey) return a.sellerLabel.localeCompare(b.sellerLabel, "fi");
    return b.monthKey.localeCompare(a.monthKey, "fi");
  });

  const exportBillingCsv = (group) => {
    exportCsv(
      `laskutus-${group.monthKey}-${group.sellerLabel.replace(/[^a-z0-9åäö_-]+/gi, "-")}.csv`,
      [
        ["Kuukausi", "Myyjä", "Ostaja", "Erä", "Kg", "Hinta €/kg", "Kaupan arvo €", "Komissio %", "Komissio €", "Päivä", "Tila"],
        ...group.offers.map((offer) => [
          group.monthKey,
          group.sellerLabel,
          offer.buyerLabel,
          String(offer.species_summary || "").split("\n").join(" | "),
          offer.billingKilos,
          offer.billingPricePerKg,
          offer.tradeValue.toFixed(2),
          `${(COMMISSION_RATE * 100).toFixed(1)} %`,
          offer.commissionValue.toFixed(2),
          offer.updated_at || offer.created_at || "",
          buyerStatusLabel(offer.status),
        ]),
      ],
    );
  };

  return (
    <div style={styles.stack}>
      <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
        <div style={styles.rowBetween}>
          <strong>Laskutus</strong>
          <select style={styles.input} value={billingFilter} onChange={(e) => setBillingFilter(e.target.value)}>
            <option value="unbilled">Laskuttamattomat</option>
            <option value="invoiced">Laskutetut</option>
            <option value="paid">Maksetut</option>
            <option value="all">Kaikki</option>
          </select>
        </div>
        <div style={styles.noticeInfo}>Tähän kerätään kaikki hyväksytyt kaupat myyjäkohtaisesti ja kuukausittain. Komissio lasketaan oletuksella {(COMMISSION_RATE * 100).toFixed(1)} % kaupan arvosta.</div>
      </div>

      {groups.length === 0 ? (
        <div style={{ ...styles.card, ...styles.sectionCard }}>
          <div style={styles.muted}>Ei vielä hyväksyttyjä kauppoja laskutettavaksi.</div>
        </div>
      ) : (
        groups.map((group) => (
          <div key={`${group.monthKey}-${group.sellerKey}`} style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
            <div style={styles.rowBetween}>
              <div>
                <strong>{group.sellerLabel}</strong>
                <div style={styles.muted}>Kuukausi: {group.monthKey}</div>
              </div>
              <button style={styles.button} onClick={() => exportBillingCsv(group)}>Vie laskutus CSV</button>
            </div>

            <div style={styles.entryBadges}>
              <span style={styles.badge}>{group.totalKilos.toFixed(1)} kg</span>
              <span style={styles.badge}>{euro(group.totalTradeValue)} kaupan arvo</span>
              <span style={styles.badge}>{euro(group.totalCommissionValue)} komissio</span>
              <span style={styles.badge}>{group.offers.length} kauppaa</span>
            </div>

            {group.offers.map((offer) => (
              <div key={offer.id} style={styles.entry}>
                <div style={styles.entryBadges}>
                  <span style={styles.badge}>{offer.buyerLabel}</span>
                  <span style={styles.badge}>{offer.billingKilos} kg</span>
                  <span style={styles.badge}>{euro(offer.billingPricePerKg)} / kg</span>
                  <span style={styles.badge}>{euro(offer.tradeValue)}</span>
                  <span style={{ ...styles.badge, background: "#ecfdf5", borderColor: "#86efac" }}>{euro(offer.commissionValue)} komissio</span>
                </div>
                <div style={{ ...styles.muted, whiteSpace: "pre-wrap" }}><strong>Erä:</strong> {formatSpeciesSummaryText(offer.species_summary) || "-"}</div>
                {getOfferSummaryCatchDates(offer.species_summary).length > 0 ? <div style={styles.muted}><strong>Pyyntipäivämäärä:</strong> {getOfferSummaryCatchDates(offer.species_summary).join(", ")}</div> : null}
                <div style={styles.muted}><strong>Päivä:</strong> {offer.updated_at || offer.created_at || "-"}</div>
                <div style={styles.muted}><strong>Laskutustila:</strong> {offer.billing_status === "paid" ? "Maksettu" : offer.billing_status === "invoiced" ? "Laskutettu" : "Laskuttamaton"}</div>
                {offer.buyer_message ? <div style={styles.muted}><strong>Viesti:</strong> {offer.buyer_message}</div> : null}
                <div style={{ ...styles.row, marginTop: 10 }}>
                  {offer.billing_status !== "invoiced" ? <button style={styles.button} onClick={() => onUpdateBillingStatus(offer, "invoiced")}>Merkitse laskutetuksi</button> : null}
                  {offer.billing_status !== "paid" ? <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => onUpdateBillingStatus(offer, "paid")}>Merkitse maksetuksi</button> : null}
                  {offer.billing_status !== "unbilled" ? <button style={styles.button} onClick={() => onUpdateBillingStatus(offer, "unbilled")}>Palauta laskuttamattomaksi</button> : null}
                </div>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

export default function App() {
  const publicBatchId = getRequestedPublicBatchId();
  const requestedOfferId = getRequestedOfferId();
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [availableRoleOptions, setAvailableRoleOptions] = useState([]);
  const [roleSelectionOpen, setRoleSelectionOpen] = useState(false);
  const [entries, setEntries] = useState([]);
  const [processedEntries, setProcessedEntries] = useState([]);
  const [offers, setOffers] = useState([]);
  const [buyerOffers, setBuyerOffers] = useState([]);
  const [buyerOffersFilter, setBuyerOffersFilter] = useState("open");
  const [billingFilter, setBillingFilter] = useState("unbilled");
  const [buyerOffersSearch, setBuyerOffersSearch] = useState("");
  const [buyerActiveOfferId, setBuyerActiveOfferId] = useState(null);
  const [allowedUsers, setAllowedUsers] = useState([]);
  const [pendingProfiles, setPendingProfiles] = useState([]);
  const [buyers, setBuyers] = useState([]);
  const [processorSourceEntries, setProcessorSourceEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [entryScope, setEntryScope] = useState("own");
  const [authMode, setAuthMode] = useState("signin");
  const [authForm, setAuthForm] = useState({ email: "", password: "", confirmPassword: "", displayName: "", requestedRole: "member" });
  const [authError, setAuthError] = useState("");
  const [authInfo, setAuthInfo] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [form, setForm] = useState({
    date: today(),
    area: "Saimaa",
    municipality: "",
    originCity: "",
    selectedVesselId: "",
    fishingWithoutVessel: false,
    spot: "",
    gear: "Rysä",
    price_per_kg: "",
    notes: "",
    offerToShops: false,
    offerToRestaurants: false,
    offerToWholesalers: false,
    deliveryPossible: false,
    deliveryMethod: "Nouto",
    transportMode: "",
    originPointId: "",
    transportCompanyId: "north-fresh-logistics",
    pickupAddress: "",
    pickupSurcharge: "",
    estimatedPickupTime: "",
    deliveryDestinations: [],
    deliveryArea: "",
    deliveryCost: "",
    earliestDeliveryDate: today(),
    coldTransport: false,
  });
  const [speciesRows, setSpeciesRows] = useState([createSpeciesRow()]);
  const [processedForm, setProcessedForm] = useState({
    productionDate: today(),
    bestBeforeDate: "",
    area: "Saimaa",
    municipality: "",
    originCity: "",
    spot: "",
    productName: "",
    productType: "Filee",
    processingMethod: "Fileointi",
    speciesSummary: "",
    kilos: "",
    packageSizeG: "",
    packageCount: "",
    notes: "",
    offerToShops: false,
    offerToRestaurants: false,
    offerToWholesalers: false,
    deliveryPossible: false,
    deliveryMethod: "Nouto",
    transportMode: "",
    originPointId: "",
    transportCompanyId: "north-fresh-logistics",
    pickupAddress: "",
    pickupSurcharge: "",
    estimatedPickupTime: "",
    deliveryDestinations: [],
    deliveryArea: "",
    deliveryCost: "",
    earliestDeliveryDate: today(),
    coldTransport: true,
    sourceEntryIds: [],
  });
  const [newAllowedForm, setNewAllowedForm] = useState({ email: "", displayName: "", role: "member", buyer_id: "" });
  const [buyerAction, setBuyerAction] = useState({ counter_price_per_kg: "", reserved_kilos: "", buyer_message: "" });
  const [offerForm, setOfferForm] = useState({
    company_name: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    offer_price_per_kg: "",
    message: "",
  });
  const [userMessage, setUserMessage] = useState("");
  const [buyerForm, setBuyerForm] = useState({
    id: "",
    company_name: "",
    buyer_type: "ravintola",
    contact_name: "",
    email: "",
    phone: "",
    city: "",
    min_kg: "",
    max_kg: "",
    is_active: true,
    notes: "",
    delivery_address: "",
    delivery_postcode: "",
    delivery_city: "",
    billing_address: "",
    billing_postcode: "",
    billing_city: "",
    billing_email: "",
    business_id: "",
  });
  const [buyerBillingSameAsDelivery, setBuyerBillingSameAsDelivery] = useState(false);
  const [fisherInfoForm, setFisherInfoForm] = useState({
    commercialFishingId: "",
    commercialFishingVesselId: "",
    commercialFishingVesselIdsText: "",
    eviraFacilityId: "",
  });
  const [fisherInfoDirty, setFisherInfoDirty] = useState(false);
  const [accountPanelOpen, setAccountPanelOpen] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [accountForm, setAccountForm] = useState({
    displayName: "",
    eviraFacilityId: "",
    commercialFishingVesselId: "",
    commercialFishingVesselIdsText: "",
    commercialFishingId: "",
    pickupAddress: "",
    companyName: "",
    businessId: "",
    address: "",
    postcode: "",
    city: "",
    billingAddress: "",
    billingPostcode: "",
    billingCity: "",
    billingEmail: "",
    einvoiceAddress: "",
    contactEmail: "",
    phone: "",
    contactName: "",
    deliveryAddress: "",
    deliveryPostcode: "",
    deliveryCity: "",
    notes: "",
  });
  const [accountFormDirty, setAccountFormDirty] = useState(false);
  const [accountBillingSameAsDelivery, setAccountBillingSameAsDelivery] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ newPassword: "", confirmPassword: "" });
  const [publicBatchData, setPublicBatchData] = useState(null);
  const [publicBatchLoading, setPublicBatchLoading] = useState(Boolean(publicBatchId));
  const [publicBatchError, setPublicBatchError] = useState("");
  const [labelPrintEntry, setLabelPrintEntry] = useState(null);
  const [labelPrintCount, setLabelPrintCount] = useState(10);
  const accountFormSyncingRef = useRef(false);
  const fisherInfoSyncingRef = useRef(false);
  const accountFormInitializedRef = useRef(false);
  const fisherInfoInitializedRef = useRef(false);

  const getMatchingAllowedRole = useCallback((allowedRows, currentProfile) => {
    if (!currentProfile) return null;
    return (allowedRows || []).find((row) => (
      row.role === currentProfile.role &&
      String(row.buyer_id || "") === String(currentProfile.buyer_id || "")
    )) || null;
  }, []);

  const linkedBuyerRecord = useMemo(() => {
    if (!profile || profile.role !== "buyer") return null;
    const normalizedProfileEmail = normalizeEmail(profile.email);
    return buyers.find((buyer) => buyer.id === profile.buyer_id || normalizeEmail(buyer.email) === normalizedProfileEmail) || null;
  }, [buyers, profile]);

  const activeRoleOption = useMemo(
    () => getMatchingAllowedRole(availableRoleOptions, profile),
    [availableRoleOptions, getMatchingAllowedRole, profile],
  );
  const commercialFishingVesselOptions = useMemo(
    () => getCommercialFishingVesselIds(profile),
    [profile],
  );

  const calculateCommissionDetails = (offer) => {
    const kilos = Number(offer?.reserved_kilos || offer?.total_kilos || 0);
    const pricePerKg = Number(offer?.counter_price_per_kg || offer?.price_per_kg || 0);
    const directTradeValue = kilos * pricePerKg;
    const summaryTradeValue = parseTradeValueFromSpeciesSummary(offer?.species_summary);
    const tradeValue = directTradeValue > 0 ? directTradeValue : summaryTradeValue;
    const commissionValue = tradeValue * COMMISSION_RATE;
    return { kilos, pricePerKg, tradeValue, commissionValue };
  };

  const buyerTypeLabel = (type) => {
    if (type === "ravintola") return "Anonyymi ravintola";
    if (type === "tukku") return "Anonyymi tukku";
    if (type === "kauppa") return "Anonyymi kauppa";
    return "Anonyymi ostaja";
  };

  const buyerStatusLabel = (status) => {
    if (status === "sent") return "Tarjous lähetetty";
    if (status === "viewed") return "Avattu";
    if (status === "countered") return "Vastatarjous";
    if (status === "reserved") return "Varattu";
    if (status === "accepted") return "Kauppa hyväksytty";
    if (status === "sold") return "MYYTY";
    if (status === "rejected") return "Hylätty";
    if (status === "cancelled") return "Peruttu";
    return status || "-";
  };

  const shouldRevealBuyerIdentity = (status) => status === "accepted";

  const getSellerIdentityForBuyer = (offer) => {
    const matchingEntry = entries.find((entry) => {
      if (offer.batch_id && entry.batchId) return offer.batch_id === entry.batchId;
      return (
        entry.ownerUserId === offer.seller_user_id &&
        entry.area === offer.area &&
        (entry.spot || "") === (offer.spot || "") &&
        Number(entry.kilos || 0) === Number(offer.total_kilos || 0)
      );
    });

    return {
      sellerName: offer.seller_name || matchingEntry?.ownerName || "Myyjä",
      sellerCommercialFishingId: matchingEntry?.commercialFishingId || "",
      sellerArea: matchingEntry?.area || offer.area || "",
      municipality: matchingEntry?.municipality || "",
      sellerSpot: matchingEntry?.spot || offer.spot || "",
      deliveryMethod: matchingEntry?.deliveryMethod || offer?.delivery_method || "",
      deliveryArea: matchingEntry?.deliveryArea || offer?.delivery_area || "",
      deliveryCost: matchingEntry?.deliveryCost ?? offer?.delivery_cost ?? "",
      earliestDeliveryDate: matchingEntry?.earliestDeliveryDate || offer?.earliest_delivery_date || "",
      coldTransport: matchingEntry?.coldTransport ?? Boolean(offer?.cold_transport),
    };
  };

  const getBuyerVisibleSellerInfo = (offer) => {
    const sellerIdentity = getSellerIdentityForBuyer(offer);
    const revealIdentity = offer?.status === "accepted";
    const isPickup = sellerIdentity.deliveryMethod === "Nouto";
    const publicPickupLocation = getPublicPickupLocation({
      municipality: sellerIdentity.municipality,
      deliveryArea: sellerIdentity.deliveryArea,
      area: sellerIdentity.sellerArea || offer?.area,
    });

    return {
      ...sellerIdentity,
      revealIdentity,
      sellerLabel: revealIdentity ? sellerIdentity.sellerName : ANONYMOUS_SELLER_LABEL,
      publicLocation: isPickup ? publicPickupLocation : (sellerIdentity.deliveryArea || sellerIdentity.sellerArea || "-"),
      exactLocation: sellerIdentity.deliveryArea || sellerIdentity.sellerArea || "-",
      publicSpot: revealIdentity ? (sellerIdentity.sellerSpot || "") : "",
    };
  };
  const getEntryReservation = (entry) => {
    const matches = (buyerOffers || []).filter((offer) => {
      if (offer.status !== "reserved" && offer.status !== "accepted") return false;
      if (offer.batch_id && entry.batchId) return offer.batch_id === entry.batchId;
      return (
        offer.seller_user_id === entry.ownerUserId &&
        offer.area === entry.area &&
        offer.spot === (entry.spot || "") &&
        Number(offer.total_kilos || 0) === Number(entry.kilos || 0)
      );
    });

    if (matches.length === 0) return null;
    return matches.sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime())[0];
  };
  const shouldSendOffer = form.offerToShops || form.offerToRestaurants || form.offerToWholesalers;
  const shouldSendProcessedOffer = processedForm.offerToShops || processedForm.offerToRestaurants || processedForm.offerToWholesalers;
  const currentOriginCity = form.originCity || form.municipality || "";
  const currentProcessedOriginCity = processedForm.originCity || processedForm.municipality || "";
  const savedPickupAddress = profile?.pickup_address || "";
  const resolvedPickupAddress = (form.pickupAddress || savedPickupAddress || "").trim();
  const resolvedProcessedPickupAddress = (processedForm.pickupAddress || savedPickupAddress || "").trim();
  const availableOriginPoints = useMemo(
    () => getAvailableOriginPoints(currentOriginCity, form.area, form.transportMode),
    [currentOriginCity, form.area, form.transportMode],
  );
  const availableProcessedOriginPoints = useMemo(
    () => getAvailableOriginPoints(currentProcessedOriginCity, processedForm.area, processedForm.transportMode),
    [currentProcessedOriginCity, processedForm.area, processedForm.transportMode],
  );
  const availableRouteOptions = useMemo(
    () => (form.originPointId ? getRouteOptionsForPoint(form.originPointId, speciesRows.reduce((sum, row) => sum + Number(row.kilos || 0), 0)) : []),
    [form.originPointId, speciesRows],
  );
  const availableProcessedRouteOptions = useMemo(
    () => (processedForm.originPointId ? getRouteOptionsForPoint(processedForm.originPointId, Number(processedForm.kilos || 0)) : []),
    [processedForm.originPointId, processedForm.kilos],
  );
  const suggestedDeliveryCities = useMemo(
    () => getSuggestedDestinationCities(currentOriginCity, form.area),
    [currentOriginCity, form.area],
  );
  const suggestedProcessedDeliveryCities = useMemo(
    () => getSuggestedDestinationCities(currentProcessedOriginCity, processedForm.area),
    [currentProcessedOriginCity, processedForm.area],
  );
  const availableDestinationCities = useMemo(
    () => Array.from(new Set([
      ...alwaysSuggestedDestinationCities,
      ...availableRouteOptions.map((item) => item.destination_city),
      ...(Array.isArray(form.deliveryDestinations) ? form.deliveryDestinations : []),
    ])).filter(Boolean),
    [availableRouteOptions, form.deliveryDestinations],
  );
  const availableProcessedDestinationCities = useMemo(
    () => Array.from(new Set([
      ...alwaysSuggestedDestinationCities,
      ...availableProcessedRouteOptions.map((item) => item.destination_city),
      ...(Array.isArray(processedForm.deliveryDestinations) ? processedForm.deliveryDestinations : []),
    ])).filter(Boolean),
    [availableProcessedRouteOptions, processedForm.deliveryDestinations],
  );

  const analyzeOfferRecipients = (offerFormState, rows) => {
    const totalKilos = rows.reduce((sum, row) => sum + Number(row.kilos || 0), 0);
    const productTotal = getOfferProductTotal(rows);
    const selectedTypes = [];
    if (offerFormState.offerToShops) selectedTypes.push("kauppa");
    if (offerFormState.offerToRestaurants) selectedTypes.push("ravintola");
    if (offerFormState.offerToWholesalers) selectedTypes.push("tukku");

    const matching = [];
    const excluded = [];

    (buyers || [])
      .filter((buyer) => buyer.is_active)
      .forEach((buyer) => {
        if (!selectedTypes.includes(buyer.buyer_type)) return;
        const minKg = buyer.min_kg == null || buyer.min_kg === "" ? null : Number(buyer.min_kg);
        const maxKg = buyer.max_kg == null || buyer.max_kg === "" ? null : Number(buyer.max_kg);
        const minOk = minKg == null || totalKilos >= minKg;
        const maxOk = maxKg == null || totalKilos <= maxKg;
        const recipient = {
          buyer_id: buyer.id,
          email: buyer.email,
          channel: buyer.buyer_type,
          company_name: buyer.company_name,
          contact_name: buyer.contact_name,
          destination_city: buyer.city || "",
        };

        if (!minOk || !maxOk) {
          excluded.push({
            ...recipient,
            minKg,
            maxKg,
            reason: !minOk
              ? `erä ${totalKilos.toFixed(1)} kg on pienempi kuin ostajan minimi ${Number(minKg || 0).toFixed(1)} kg`
              : `erä ${totalKilos.toFixed(1)} kg ylittää ostajan maksimin ${Number(maxKg || 0).toFixed(1)} kg`,
          });
          return;
        }

        if (offerFormState.deliveryPossible && offerFormState.deliveryMethod === "Kuljetus järjestetään") {
          const buyerCity = String(buyer.city || "").trim();
          if (!buyerCity) {
            excluded.push({
              ...recipient,
              reason: "ostajan paikkakunta puuttuu",
            });
            return;
          }

          const allowedDestinations = Array.isArray(offerFormState.deliveryDestinations) ? offerFormState.deliveryDestinations : [];
          if (!allowedDestinations.includes(buyerCity)) {
            excluded.push({
              ...recipient,
              reason: `kohde ${buyerCity} ei kuulu valittuihin toimituskohteisiin`,
            });
            return;
          }

          const routePrice = getRoutePrice(offerFormState.originPointId, buyerCity, totalKilos);
          if (!routePrice) {
            excluded.push({
              ...recipient,
              reason: `reittihintaa ei löydy kohteeseen ${buyerCity}`,
            });
            return;
          }

          matching.push({
            ...recipient,
            route_price_eur: Number(routePrice.price_eur || 0),
            total_price_eur: productTotal + Number(routePrice.price_eur || 0),
            delivered_price_per_kg: totalKilos > 0 ? (productTotal + Number(routePrice.price_eur || 0)) / totalKilos : "",
            cutoff_time: routePrice.cutoff_time || "",
            carrier_id: routePrice.carrier_id || "",
            carrier_name: routePrice.carrier_name || "",
          });
          return;
        }

        matching.push(recipient);
      });

    const dedupedMatching = matching.filter((recipient, index, array) => index === array.findIndex((item) => (item.email || "").trim().toLowerCase() === (recipient.email || "").trim().toLowerCase()));
    return {
      totalKilos,
      selectedTypes,
      matching: dedupedMatching,
      excluded,
    };
  };

  const buildOfferRecipients = (offerFormState, rows) => {
    return analyzeOfferRecipients(offerFormState, rows).matching;
  };

  const invalidateSession = async (message = "Istunto on vanhentunut. Kirjaudu uudelleen sisään.") => {
    await clearBrokenSession();
    setSession(null);
    setProfile(null);
    setAvailableRoleOptions([]);
    setRoleSelectionOpen(false);
    setEntries([]);
      setProcessedEntries([]);
      setOffers([]);
      setAllowedUsers([]);
    setAuthMode("signin");
    setAuthInfo("");
    setAuthError(message);
  };

  useEffect(() => {
    runLocalTests();

    const init = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          if (isMissingRefreshTokenError(error)) {
            await invalidateSession();
            setLoading(false);
            return;
          }
          setAuthError(error.message);
        }
        setSession(data?.session ?? null);
      } catch (error) {
        if (isMissingRefreshTokenError(error)) {
          await invalidateSession();
        } else {
          setAuthError(String(error?.message || error));
        }
      } finally {
        setLoading(false);
      }
    };
    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (event === "TOKEN_REFRESH_FAILED") {
        await invalidateSession();
        return;
      }
      if (event === "PASSWORD_RECOVERY") {
        setAuthMode("recovery");
        setAuthError("");
        setAuthInfo("Aseta uusi salasana jatkaaksesi.");
        setAuthForm((prev) => ({
          ...prev,
          email: (nextSession?.user?.email || prev.email || "").trim().toLowerCase(),
          password: "",
          confirmPassword: "",
        }));
      }
      setSession(nextSession ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const linkedOffer = params.get("offer");
    if (linkedOffer) {
      setBuyerActiveOfferId(linkedOffer);
      setActiveTab("offers");
    }
  }, []);

  useEffect(() => {
    if (!requestedOfferId || profile?.role !== "buyer" || buyerOffers.length === 0) return;
    const linkedOffer = buyerOffers.find((offer) => offer.id === requestedOfferId);
    if (!linkedOffer) return;

    setBuyerActiveOfferId(linkedOffer.id);

    if (["accepted", "sold"].includes(linkedOffer.status)) {
      setBuyerOffersFilter("accepted");
    } else if (linkedOffer.status === "reserved") {
      setBuyerOffersFilter("reserved");
    } else if (linkedOffer.status === "countered") {
      setBuyerOffersFilter("countered");
    } else if (linkedOffer.status === "rejected") {
      setBuyerOffersFilter("rejected");
    } else {
      setBuyerOffersFilter("open");
    }
  }, [requestedOfferId, profile?.role, buyerOffers]);

  useEffect(() => {
    if (!publicBatchId) {
      setPublicBatchData(null);
      setPublicBatchLoading(false);
      setPublicBatchError("");
      return;
    }

    let cancelled = false;

    const loadPublicBatch = async () => {
      setPublicBatchLoading(true);
      setPublicBatchError("");

      try {
        const response = await fetch(getPublicBatchInfoUrl(publicBatchId));
        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(result?.error || `Erän tietoja ei voitu hakea (HTTP ${response.status}).`);
        }

        if (!cancelled) {
          setPublicBatchData(result);
        }
      } catch (error) {
        if (!cancelled) {
          setPublicBatchData(null);
          setPublicBatchError(String(error?.message || error || "Erän tietoja ei voitu hakea."));
        }
      } finally {
        if (!cancelled) {
          setPublicBatchLoading(false);
        }
      }
    };

    loadPublicBatch();
    return () => {
      cancelled = true;
    };
  }, [publicBatchId]);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      setAvailableRoleOptions([]);
      setRoleSelectionOpen(false);
      setEntries([]);
      setProcessedEntries([]);
      setOffers([]);
      setAllowedUsers([]);
      setPendingProfiles([]);
      return;
    }

    const ensureProfile = async () => {
      const email = (session.user.email || "").trim().toLowerCase();
      const { data: allowedRows, error: allowedError } = await findAllowedUsersByEmail(supabase, email);
      if (allowedError && allowedError.code !== "PGRST116") {
        if (isMissingRefreshTokenError(allowedError)) {
          await invalidateSession();
          return;
        }
        setAuthError(allowedError.message);
        return;
      }
      const activeAllowedRows = (allowedRows || []).filter((row) => row.is_active);

      const { data: existingProfile, error: profileError } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
      if (profileError && profileError.code !== "PGRST116") {
        if (isMissingRefreshTokenError(profileError)) {
          await invalidateSession();
          return;
        }
        setAuthError(profileError.message);
        return;
      }
      if (existingProfile) {
        let profileToUse = existingProfile;
        const matchingAllowedRole = getMatchingAllowedRole(activeAllowedRows, existingProfile);
        const selectedAllowedRole = matchingAllowedRole || activeAllowedRows[0] || null;
        if (!selectedAllowedRole) {
          const normalizedProfile = {
            ...profileToUse,
            email: (profileToUse.email || email || "").trim().toLowerCase(),
            is_active: false,
          };
          setProfile(normalizedProfile);
          setAvailableRoleOptions([]);
          setRoleSelectionOpen(false);
          setAuthInfo("Tunnus odottaa ownerin hyväksyntää.");
          return;
        }
        if (
          existingProfile.role !== selectedAllowedRole.role ||
          String(existingProfile.buyer_id || "") !== String(selectedAllowedRole.buyer_id || "")
        ) {
          const { data: updatedProfile, error: updateProfileError } = await supabase
            .from("profiles")
            .update({
              role: selectedAllowedRole.role || "member",
              buyer_id: selectedAllowedRole.buyer_id || null,
              is_active: selectedAllowedRole.is_active,
            })
            .eq("id", session.user.id)
            .select("*")
            .single();
          if (!updateProfileError && updatedProfile) {
            profileToUse = updatedProfile;
          }
        }
        const normalizedProfile = {
          ...profileToUse,
          email: (profileToUse.email || email || "").trim().toLowerCase(),
        };
        setProfile(normalizedProfile);
        setAvailableRoleOptions(activeAllowedRows);
        setRoleSelectionOpen(activeAllowedRows.length > 1);
        fisherInfoSyncingRef.current = true;
        setFisherInfoForm({
          commercialFishingId: profileToUse.commercial_fishing_id || "",
          commercialFishingVesselId: profileToUse.commercial_fishing_vessel_id || "",
          commercialFishingVesselIdsText: getCommercialFishingVesselIds(profileToUse).join("\n"),
          eviraFacilityId: profileToUse.evira_facility_id || "",
        });
        setFisherInfoDirty(false);
        return;
      }
      const defaultAllowedRole = activeAllowedRows[0] || null;
      const requestedRole = session.user.user_metadata?.requested_role === "buyer"
        ? "buyer"
        : session.user.user_metadata?.requested_role === "processor"
          ? "processor"
          : "member";
      const { data: insertedProfile, error: insertError } = await supabase
        .from("profiles")
        .insert({
          id: session.user.id,
          email,
          display_name: defaultAllowedRole?.display_name || session.user.user_metadata?.display_name || email,
          role: defaultAllowedRole?.role || requestedRole,
          is_active: defaultAllowedRole?.is_active || false,
          buyer_id: defaultAllowedRole?.buyer_id || null,
        })
        .select("*")
        .single();
      if (insertError) {
        if (isMissingRefreshTokenError(insertError)) {
          await invalidateSession();
          return;
        }
        setAuthError(insertError.message);
        return;
      }
      const normalizedInsertedProfile = {
        ...insertedProfile,
        email: (insertedProfile.email || email || "").trim().toLowerCase(),
      };
      setProfile(normalizedInsertedProfile);
      setAvailableRoleOptions(activeAllowedRows);
      setRoleSelectionOpen(activeAllowedRows.length > 1);
      if (!defaultAllowedRole) {
        setAuthInfo("Tunnus odottaa ownerin hyväksyntää.");
      }
      fisherInfoSyncingRef.current = true;
      setFisherInfoForm({
        commercialFishingId: insertedProfile.commercial_fishing_id || "",
        commercialFishingVesselId: insertedProfile.commercial_fishing_vessel_id || "",
        commercialFishingVesselIdsText: getCommercialFishingVesselIds(insertedProfile).join("\n"),
        eviraFacilityId: insertedProfile.evira_facility_id || "",
      });
      setFisherInfoDirty(false);
    };

    ensureProfile();
  }, [session]);

  useEffect(() => {
    if (!profile) return;

    const loadData = async () => {
      setAuthError("");

      const entriesQuery = supabase.from("catch_entries").select("*").order("date", { ascending: false }).order("created_at", { ascending: false });
      const finalEntriesQuery = profile.role === "owner" && entryScope === "all" ? entriesQuery : entriesQuery.eq("owner_user_id", profile.id);

      const offerTableExists = async () => {
        const { error } = await supabase.from("wholesale_offers").select("id", { count: "exact", head: true });
        return !error;
      };
      const buyersTableExists = async () => {
        const { error } = await supabase.from("buyers").select("id", { count: "exact", head: true });
        return !error;
      };
      const processedBatchesTableExists = async () => {
        const { error } = await supabase.from("processed_batches").select("id", { count: "exact", head: true });
        return !error;
      };
      const processedBatchSourcesTableExists = async () => {
        const { error } = await supabase.from("processed_batch_sources").select("id", { count: "exact", head: true });
        return !error;
      };
      const buyerOffersTableExists = async () => {
        const { error } = await supabase.from("buyer_offers").select("id", { count: "exact", head: true });
        return !error;
      };

      try {
        const hasOffersTable = await offerTableExists();
        const hasBuyersTable = await buyersTableExists();
        const hasProcessedBatchesTable = await processedBatchesTableExists();
        const hasProcessedBatchSourcesTable = await processedBatchSourcesTableExists();
        const hasBuyerOffersTable = await buyerOffersTableExists();

        const normalizedProfileEmail = (profile.email || "").trim().toLowerCase();

        const buyerOffersPromise = hasBuyerOffersTable
          ? profile.role === "buyer"
            ? (() => {
                const query = supabase
                  .from("buyer_offers")
                  .select("*")
                  .in("status", ["sent", "viewed", "countered", "reserved", "accepted", "sold", "rejected", "expired", "cancelled"])
                  .order("created_at", { ascending: false });
                return profile.buyer_id
                  ? query.or(`buyer_id.eq.${profile.buyer_id},buyer_email.eq.${normalizedProfileEmail}`)
                  : query.eq("buyer_email", normalizedProfileEmail);
              })()
            : supabase
                .from("buyer_offers")
                .select("*")
                .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null });
        const processorAcceptedOffersPromise = hasBuyerOffersTable && profile.role === "processor"
          ? supabase
              .from("buyer_offers")
              .select("id, batch_id, species_summary, buyer_email, status")
              .eq("buyer_email", normalizedProfileEmail)
              .eq("status", "accepted")
              .order("updated_at", { ascending: false })
          : Promise.resolve({ data: [], error: null });

        const [
          { data: entryData, error: entryError },
          processedEntriesResult,
          { data: allowedData, error: allowedError },
          pendingProfilesResult,
          offerResult,
          buyersResult,
          buyerOffersResult,
          processorAcceptedOffersResult,
        ] = await Promise.all([
          finalEntriesQuery,
          hasProcessedBatchesTable
            ? ((profile.role === "owner" && entryScope === "all")
              ? supabase.from("processed_batches").select("*").order("production_date", { ascending: false }).order("created_at", { ascending: false })
              : supabase.from("processed_batches").select("*").eq("owner_user_id", profile.id).order("production_date", { ascending: false }).order("created_at", { ascending: false }))
            : Promise.resolve({ data: [], error: null }),
          profile.role === "owner"
            ? supabase.from("allowed_users").select("*").order("created_at", { ascending: true })
            : Promise.resolve({ data: [], error: null }),
          profile.role === "owner"
            ? supabase.from("profiles").select("*").eq("is_active", false).order("created_at", { ascending: false })
            : Promise.resolve({ data: [], error: null }),
          hasOffersTable
            ? supabase.from("wholesale_offers").select("*").order("created_at", { ascending: false })
            : Promise.resolve({ data: [], error: null }),
          hasBuyersTable
            ? supabase.from("buyers").select("*").order("company_name", { ascending: true })
            : Promise.resolve({ data: [], error: null }),
          buyerOffersPromise,
          processorAcceptedOffersPromise,
        ]);

        if (entryError) {
          if (isMissingRefreshTokenError(entryError)) {
            await invalidateSession();
            return;
          }
          setAuthError(entryError.message);
        } else {
          setEntries((entryData || []).map((entry) => ({
            id: entry.id,
            batchId: entry.batch_id,
            date: entry.date,
            area: entry.area,
            municipality: entry.municipality || "",
            originCity: entry.origin_city || entry.municipality || "",
            spot: entry.spot || "",
            species: entry.species,
            kilos: Number(entry.kilos || 0),
            count: Number(entry.count || 0),
            gear: entry.gear,
            notes: entry.notes || "",
            deliveryMethod: entry.delivery_method || "Nouto",
            deliveryPossible: Boolean(entry.delivery_possible),
            transportMode: entry.transport_mode || "",
            originPointId: entry.origin_point_id || "",
            transportCompanyId: entry.transport_company_id || "",
            pickupAddress: entry.pickup_address || "",
            deliveryDestinations: Array.isArray(entry.delivery_destinations) ? entry.delivery_destinations : [],
            deliveryArea: entry.delivery_area || "",
            deliveryCost: entry.delivery_cost == null ? "" : Number(entry.delivery_cost),
            earliestDeliveryDate: entry.earliest_delivery_date || "",
            coldTransport: Boolean(entry.cold_transport),
            ownerName: entry.owner_name,
            commercialFishingId: entry.commercial_fishing_id || "",
            commercialFishingVesselId: entry.commercial_fishing_vessel_id || "",
            pricePerKg: entry.price_per_kg == null ? "" : Number(entry.price_per_kg),
            ownerUserId: entry.owner_user_id,
            offerToShops: Boolean(entry.offer_to_shops),
            offerToRestaurants: Boolean(entry.offer_to_restaurants),
            offerToWholesalers: Boolean(entry.offer_to_wholesalers),
          })));
        }

        if (processorAcceptedOffersResult?.error && processorAcceptedOffersResult.error.code !== "PGRST116") {
          if (isMissingRefreshTokenError(processorAcceptedOffersResult.error)) {
            await invalidateSession();
            return;
          }
          setAuthError(processorAcceptedOffersResult.error.message);
          setProcessorSourceEntries([]);
        } else if (profile.role === "processor") {
          const purchasedBatchIds = Array.from(new Set(
            (processorAcceptedOffersResult?.data || [])
              .flatMap((offer) => {
                const summaryBatchIds = getOfferSummaryBatchItems(offer.species_summary)
                  .map((item) => item.batchId)
                  .filter(Boolean);
                const directBatchId = String(offer.batch_id || "").trim();
                return directBatchId ? [directBatchId, ...summaryBatchIds] : summaryBatchIds;
              })
              .filter(Boolean),
          ));

          if (purchasedBatchIds.length === 0) {
            setProcessorSourceEntries([]);
          } else {
            const { data: purchasedEntriesData, error: purchasedEntriesError } = await supabase
              .from("catch_entries")
              .select("*")
              .in("batch_id", purchasedBatchIds)
              .order("date", { ascending: false })
              .order("created_at", { ascending: false });

            if (purchasedEntriesError && purchasedEntriesError.code !== "PGRST116") {
              if (isMissingRefreshTokenError(purchasedEntriesError)) {
                await invalidateSession();
                return;
              }
              setAuthError(purchasedEntriesError.message);
              setProcessorSourceEntries([]);
            } else {
              setProcessorSourceEntries((purchasedEntriesData || []).map((entry) => ({
                id: entry.id,
                batchId: entry.batch_id,
                date: entry.date,
                area: entry.area,
                municipality: entry.municipality || "",
                spot: entry.spot || "",
                species: entry.species,
                kilos: Number(entry.kilos || 0),
                count: Number(entry.count || 0),
                gear: entry.gear,
                notes: entry.notes || "",
                deliveryMethod: entry.delivery_method || "Nouto",
                deliveryArea: entry.delivery_area || "",
                deliveryCost: entry.delivery_cost == null ? "" : Number(entry.delivery_cost),
                earliestDeliveryDate: entry.earliest_delivery_date || "",
                coldTransport: Boolean(entry.cold_transport),
                ownerName: entry.owner_name,
                commercialFishingId: entry.commercial_fishing_id || "",
                commercialFishingVesselId: entry.commercial_fishing_vessel_id || "",
                pricePerKg: entry.price_per_kg == null ? "" : Number(entry.price_per_kg),
                ownerUserId: entry.owner_user_id,
                offerToShops: Boolean(entry.offer_to_shops),
                offerToRestaurants: Boolean(entry.offer_to_restaurants),
                offerToWholesalers: Boolean(entry.offer_to_wholesalers),
              })));
            }
          }
        } else {
          setProcessorSourceEntries([]);
        }

        if (processedEntriesResult?.error && processedEntriesResult.error.code !== "PGRST116") {
          if (isMissingRefreshTokenError(processedEntriesResult.error)) {
            await invalidateSession();
            return;
          }
          setAuthError(processedEntriesResult.error.message);
        } else {
          let processedSourceRows = [];
          if (hasProcessedBatchSourcesTable && (processedEntriesResult?.data || []).length > 0) {
            const processedIds = (processedEntriesResult?.data || []).map((entry) => entry.id).filter(Boolean);
            if (processedIds.length > 0) {
              const { data: sourceData, error: sourceError } = await supabase
                .from("processed_batch_sources")
                .select("*")
                .in("processed_batch_id", processedIds)
                .order("created_at", { ascending: true });
              if (sourceError && sourceError.code !== "PGRST116") {
                if (isMissingRefreshTokenError(sourceError)) {
                  await invalidateSession();
                  return;
                }
                setAuthError(sourceError.message);
              } else {
                processedSourceRows = sourceData || [];
              }
            }
          }

          setProcessedEntries((processedEntriesResult?.data || []).map((entry) => ({
            id: entry.id,
            batchId: entry.batch_id,
            productionDate: entry.production_date,
            bestBeforeDate: entry.best_before_date || "",
            area: entry.area,
            municipality: entry.municipality || "",
            originCity: entry.origin_city || entry.municipality || "",
            spot: entry.spot || "",
            productName: entry.product_name || "",
            productType: entry.product_type || "",
            processingMethod: entry.processing_method || "",
            speciesSummary: entry.species_summary || "",
            kilos: Number(entry.kilos || 0),
            packageSizeG: entry.package_size_g == null ? "" : Number(entry.package_size_g),
            packageCount: entry.package_count == null ? "" : Number(entry.package_count),
            notes: entry.notes || "",
            deliveryPossible: Boolean(entry.delivery_possible),
            deliveryMethod: entry.delivery_method || "Nouto",
            transportMode: entry.transport_mode || "",
            originPointId: entry.origin_point_id || "",
            transportCompanyId: entry.transport_company_id || "",
            pickupAddress: entry.pickup_address || "",
            deliveryDestinations: Array.isArray(entry.delivery_destinations) ? entry.delivery_destinations : [],
            deliveryArea: entry.delivery_area || "",
            deliveryCost: entry.delivery_cost == null ? "" : Number(entry.delivery_cost),
            earliestDeliveryDate: entry.earliest_delivery_date || "",
            coldTransport: Boolean(entry.cold_transport),
            ownerName: entry.owner_name,
            commercialFishingId: entry.commercial_fishing_id || "",
            ownerUserId: entry.owner_user_id,
            offerToShops: Boolean(entry.offer_to_shops),
            offerToRestaurants: Boolean(entry.offer_to_restaurants),
            offerToWholesalers: Boolean(entry.offer_to_wholesalers),
            kind: "processed",
            sourceBatches: processedSourceRows
              .filter((source) => source.processed_batch_id === entry.id)
              .map((source) => ({
                sourceEntryId: source.source_entry_id,
                batchId: source.source_batch_id,
                species: source.source_species || "",
                kilos: source.source_kilos == null ? "" : Number(source.source_kilos),
                qrImageUrl: getBatchQrImageUrl(source.source_batch_id),
              })),
          })));
        }

        if (allowedError) {
          if (isMissingRefreshTokenError(allowedError)) {
            await invalidateSession();
            return;
          }
          setAuthError(allowedError.message);
        } else {
        setAllowedUsers(allowedData || []);
        setPendingProfiles((pendingProfilesResult?.data || []).filter((row) => row.id !== profile.id));
        }

        if (offerResult?.error && offerResult.error.code !== "PGRST116") {
          if (isMissingRefreshTokenError(offerResult.error)) {
            await invalidateSession();
            return;
          }
          setAuthError(offerResult.error.message);
        } else {
          setOffers((offerResult?.data || []).map((offer) => ({
            ...offer,
            offer_price_per_kg: Number(offer.offer_price_per_kg || 0),
          })));
        }

        const buyersData = (buyersResult?.data || []).map((buyer) => ({
          ...buyer,
          email: (buyer.email || "").toLowerCase(),
          min_kg: buyer.min_kg == null ? "" : Number(buyer.min_kg),
          max_kg: buyer.max_kg == null ? "" : Number(buyer.max_kg),
        }));

        if (buyersResult?.error && buyersResult.error.code !== "PGRST116") {
          if (isMissingRefreshTokenError(buyersResult.error)) {
            await invalidateSession();
            return;
          }
          setAuthError(buyersResult.error.message);
        } else {
          setBuyers(buyersData);
        }

        if (buyerOffersResult?.error && buyerOffersResult.error.code !== "PGRST116") {
          if (isMissingRefreshTokenError(buyerOffersResult.error)) {
            await invalidateSession();
            return;
          }
          setAuthError(buyerOffersResult.error.message);
        } else {
          setBuyerOffers((buyerOffersResult?.data || []).map((offer) => {
            const buyer = buyersData.find((item) => item.id === offer.buyer_id || item.email === (offer.buyer_email || "").toLowerCase());
            return {
              ...offer,
              buyer_email: (offer.buyer_email || "").toLowerCase(),
              total_kilos: Number(offer.total_kilos || 0),
              price_per_kg: offer.price_per_kg == null || offer.price_per_kg === "" ? parsePricePerKgFromNotes(offer.notes) : Number(offer.price_per_kg),
              counter_price_per_kg: offer.counter_price_per_kg == null ? "" : Number(offer.counter_price_per_kg),
              reserved_kilos: offer.reserved_kilos == null ? "" : Number(offer.reserved_kilos),
              delivery_method: offer.delivery_method || "Nouto",
              delivery_possible: Boolean(offer.delivery_possible),
              transport_mode: offer.transport_mode || "",
              origin_point_id: offer.origin_point_id || "",
              transport_company_id: offer.transport_company_id || "",
              seller_origin_city: offer.seller_origin_city || "",
              delivery_destination_city: offer.delivery_destination_city || "",
              route_price_eur: offer.route_price_eur == null ? "" : Number(offer.route_price_eur),
              total_price_eur: offer.total_price_eur == null ? "" : Number(offer.total_price_eur),
              delivered_price_per_kg: offer.delivered_price_per_kg == null ? "" : Number(offer.delivered_price_per_kg),
              delivery_destinations: Array.isArray(offer.delivery_destinations) ? offer.delivery_destinations : [],
              delivery_area: offer.delivery_area || "",
              delivery_cost: offer.delivery_cost == null ? "" : Number(offer.delivery_cost),
              earliest_delivery_date: offer.earliest_delivery_date || "",
              cold_transport: Boolean(offer.cold_transport),
              buyer_type: buyer?.buyer_type || "",
              buyer_company_name: buyer?.company_name || "",
              buyer_contact_name: buyer?.contact_name || "",
              buyer_phone: buyer?.phone || "",
              billing_status: offer.billing_status || "unbilled",
              billing_month: offer.billing_month || "",
              fulfillment_status: offer.fulfillment_status || (offer.status === "accepted" ? "awaiting_contact" : ""),
            };
          }));
        }
      } catch (error) {
        if (isMissingRefreshTokenError(error)) {
          await invalidateSession();
          return;
        }
        setAuthError(String(error?.message || error));
      }
    };

    loadData();
  }, [profile, entryScope, refreshTick]);

  useEffect(() => {
    if (!profile) return;
    if (accountFormDirty) return;
    const vesselIds = getCommercialFishingVesselIds(profile);
    const nextForm = {
      displayName: profile.display_name || "",
      eviraFacilityId: profile.evira_facility_id || "",
      commercialFishingVesselId: profile.commercial_fishing_vessel_id || vesselIds[0] || "",
      commercialFishingVesselIdsText: vesselIds.join("\n"),
      commercialFishingId: profile.commercial_fishing_id || "",
      pickupAddress: profile.pickup_address || "",
      companyName: profile.company_name || linkedBuyerRecord?.company_name || "",
      businessId: profile.business_id || linkedBuyerRecord?.business_id || "",
      address: profile.address || "",
      postcode: profile.postcode || "",
      city: profile.city || linkedBuyerRecord?.city || "",
      billingAddress: profile.billing_address || linkedBuyerRecord?.billing_address || "",
      billingPostcode: profile.billing_postcode || linkedBuyerRecord?.billing_postcode || "",
      billingCity: profile.billing_city || linkedBuyerRecord?.billing_city || "",
      billingEmail: profile.billing_email || linkedBuyerRecord?.billing_email || "",
      einvoiceAddress: profile.einvoice_address || "",
      contactEmail: profile.contact_email || profile.email || "",
      phone: profile.phone || linkedBuyerRecord?.phone || "",
      contactName: linkedBuyerRecord?.contact_name || "",
      deliveryAddress: linkedBuyerRecord?.delivery_address || "",
      deliveryPostcode: linkedBuyerRecord?.delivery_postcode || "",
      deliveryCity: linkedBuyerRecord?.delivery_city || "",
      notes: linkedBuyerRecord?.notes || "",
    };
    accountFormSyncingRef.current = true;
    setAccountForm(nextForm);
    setAccountFormDirty(false);
    setAccountBillingSameAsDelivery(
      profile.role === "buyer" ? billingMatchesDelivery(nextForm) : billingMatchesAddress(nextForm)
    );
  }, [profile, linkedBuyerRecord, accountFormDirty]);

  useEffect(() => {
    if (!accountFormInitializedRef.current) {
      accountFormInitializedRef.current = true;
      return;
    }
    if (accountFormSyncingRef.current) {
      accountFormSyncingRef.current = false;
      return;
    }
    setAccountFormDirty(true);
  }, [accountForm]);

  useEffect(() => {
    if (!fisherInfoInitializedRef.current) {
      fisherInfoInitializedRef.current = true;
      return;
    }
    if (fisherInfoSyncingRef.current) {
      fisherInfoSyncingRef.current = false;
      return;
    }
    setFisherInfoDirty(true);
  }, [fisherInfoForm]);

  useEffect(() => {
    if (commercialFishingVesselOptions.length === 0) return;
    setForm((prev) => {
      if (prev.fishingWithoutVessel) {
        return prev;
      }
      if (prev.selectedVesselId && commercialFishingVesselOptions.includes(prev.selectedVesselId)) {
        return prev;
      }
      return { ...prev, selectedVesselId: commercialFishingVesselOptions[0] };
    });
  }, [commercialFishingVesselOptions]);

  const applyAccountDeliveryToBilling = useCallback(() => {
    setAccountForm((prev) => ({
      ...prev,
      billingAddress: prev.deliveryAddress,
      billingPostcode: prev.deliveryPostcode,
      billingCity: prev.deliveryCity,
    }));
  }, []);

  const applyAccountAddressToBilling = useCallback(() => {
    setAccountForm((prev) => ({
      ...prev,
      billingAddress: prev.address,
      billingPostcode: prev.postcode,
      billingCity: prev.city,
    }));
  }, []);

  const applyBuyerDeliveryToBilling = useCallback(() => {
    setBuyerForm((prev) => ({
      ...prev,
      billing_address: prev.delivery_address,
      billing_postcode: prev.delivery_postcode,
      billing_city: prev.delivery_city,
    }));
  }, []);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (!q) return true;
      return [entry.species, entry.area, entry.municipality, entry.spot, entry.gear, entry.notes, entry.ownerName].join(" ").toLowerCase().includes(q);
    });
  }, [entries, search]);

  const groupedFilteredEntries = useMemo(() => {
    const formatter = new Intl.DateTimeFormat("fi-FI", {
      month: "long",
      year: "numeric",
    });

    const groups = filteredEntries.reduce((acc, entry) => {
      const monthKey = String(entry.date || "").slice(0, 7) || "unknown";
      const existingGroup = acc.get(monthKey) || {
        key: monthKey,
        label: monthKey === "unknown"
          ? "Päivämäärä puuttuu"
          : formatter.format(new Date(`${monthKey}-01T00:00:00`)),
        entries: [],
        totalKilos: 0,
        forSaleKilos: 0,
        speciesSummary: new Map(),
      };

      existingGroup.entries.push(entry);
      existingGroup.totalKilos += Number(entry.kilos || 0);
      const speciesKey = formatSpeciesForSale(entry.species);
      existingGroup.speciesSummary.set(
        speciesKey,
        Number(existingGroup.speciesSummary.get(speciesKey) || 0) + Number(entry.kilos || 0)
      );
      if (entry.offerToShops || entry.offerToRestaurants || entry.offerToWholesalers) {
        existingGroup.forSaleKilos += Number(entry.kilos || 0);
      }

      acc.set(monthKey, existingGroup);
      return acc;
    }, new Map());

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        speciesSummary: Array.from(group.speciesSummary.entries())
          .map(([species, kilos]) => ({ species, kilos }))
          .sort((a, b) => b.kilos - a.kilos),
      }))
      .sort((a, b) => b.key.localeCompare(a.key));
  }, [filteredEntries]);

  const saleEntries = useMemo(() => entries.filter((entry) => entry.offerToShops || entry.offerToRestaurants || entry.offerToWholesalers), [entries]);
  const processedSaleEntries = useMemo(() => processedEntries.filter((entry) => entry.offerToShops || entry.offerToRestaurants || entry.offerToWholesalers), [processedEntries]);
  const availableSourceEntries = useMemo(
    () => (profile?.role === "processor" ? processorSourceEntries : entries)
      .filter((entry) => entry.batchId && (Number(entry.kilos || 0) > 0 || Number(entry.count || 0) > 0))
      .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()),
    [entries, processorSourceEntries, profile?.role],
  );
  const selectedProcessedSourceEntries = useMemo(
    () => availableSourceEntries.filter((entry) => processedForm.sourceEntryIds.includes(entry.id)),
    [availableSourceEntries, processedForm.sourceEntryIds],
  );

  const totals = useMemo(() => {
    const totalKg = entries.reduce((sum, e) => sum + Number(e.kilos || 0), 0);
    const forSaleKg = saleEntries.reduce((sum, e) => sum + Number(e.kilos || 0), 0);
    const totalProcessedKg = processedEntries.reduce((sum, e) => sum + Number(e.kilos || 0), 0);
    const processedForSaleKg = processedSaleEntries.reduce((sum, e) => sum + Number(e.kilos || 0), 0);
    const speciesSummary = Array.from(new Set([...fishSpecies.filter((species) => species !== "Muu"), ...entries.map((entry) => entry.species).filter(Boolean)]))
      .map((species) => ({ species, kilos: entries.filter((e) => e.species === species).reduce((sum, e) => sum + Number(e.kilos || 0), 0) }))
      .filter((item) => item.kilos > 0)
      .sort((a, b) => b.kilos - a.kilos);
    const processedSummary = processedProductTypes
      .map((productType) => ({ productType, kilos: processedEntries.filter((e) => e.productType === productType).reduce((sum, e) => sum + Number(e.kilos || 0), 0) }))
      .filter((item) => item.kilos > 0)
      .sort((a, b) => b.kilos - a.kilos);
    return { totalKg, forSaleKg, totalProcessedKg, processedForSaleKg, speciesSummary, processedSummary };
  }, [entries, saleEntries, processedEntries, processedSaleEntries]);

  const addSpeciesRow = () => setSpeciesRows((prev) => [...prev, createSpeciesRow()]);
  const updateSpeciesRow = (id, field, value) => setSpeciesRows((prev) => prev.map((row) => {
    if (row.id !== id) return row;
    if (field === "species") {
      return { ...row, species: value, customSpecies: value === "Muu" ? row.customSpecies : "" };
    }
    return { ...row, [field]: value };
  }));
  const removeSpeciesRow = (id) => setSpeciesRows((prev) => (prev.length === 1 ? [createSpeciesRow()] : prev.filter((row) => row.id !== id)));
  const duplicateSpeciesRow = (id) => setSpeciesRows((prev) => {
    const row = prev.find((item) => item.id === id);
    if (!row) return prev;
    const copy = { ...row, id: safeId() };
    const index = prev.findIndex((item) => item.id === id);
    return [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)];
  });

  const handleSignIn = async () => {
    setAuthError("");
    setAuthInfo("");
    const email = normalizeEmail(authForm.email);
    const password = authForm.password;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setAuthError("Väärä sähköposti tai salasana – tai käyttäjää ei ole vielä rekisteröity.");
    }
  };

  const handleSignUp = async () => {
    setAuthError("");
    setAuthInfo("");
    const email = normalizeEmail(authForm.email);
    const password = authForm.password;
    const displayName = authForm.displayName.trim();
    const requestedRole = authForm.requestedRole === "buyer" ? "buyer" : authForm.requestedRole === "processor" ? "processor" : "member";
    if (!email || !password || !displayName) {
      setAuthError("Täytä sähköposti, salasana ja nimi.");
      return;
    }
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName, requested_role: requestedRole } } });
    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      const message = String(error.message || "");
      if (message.toLowerCase().includes("user already registered")) {
        setAuthInfo("");
        setAuthError("Tällä sähköpostilla on jo käyttäjätili. Kirjaudu sisään olemassa olevalla tunnuksella tai nollaa salasana Supabasen Auth-käyttäjälle, jos haluat ottaa sähköpostin uudelleen käyttöön.");
        setAuthMode("signin");
        return;
      }
      setAuthError(error.message);
      return;
    }
    setAuthInfo("Tunnus luotu ja lähetetty hyväksyttäväksi. Voit kirjautua sisään, mutta appi aukeaa vasta kun owner hyväksyy roolin.");
    setAuthMode("signin");
  };

  const handleForgotPassword = async () => {
    setAuthError("");
    setAuthInfo("");
    const email = normalizeEmail(authForm.email);
    if (!email) {
      setAuthError("Syötä sähköpostiosoite ennen salasanan palautusta.");
      return;
    }
    const redirectTo = typeof window !== "undefined" ? window.location.origin : getPublicAppBaseUrl();
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setAuthError(error.message);
      return;
    }
    setAuthInfo("Salasanan palautuslinkki lähetettiin sähköpostiisi.");
  };

  const handleResetRecoveredPassword = async () => {
    setAuthError("");
    setAuthInfo("");
    const password = authForm.password;
    const confirmPassword = authForm.confirmPassword;
    if (!password || password.length < 8) {
      setAuthError("Uuden salasanan pitää olla vähintään 8 merkkiä.");
      return;
    }
    if (password !== confirmPassword) {
      setAuthError("Salasanat eivät täsmää.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setAuthError(error.message);
      return;
    }
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setAvailableRoleOptions([]);
    setRoleSelectionOpen(false);
    setAuthForm((prev) => ({ ...prev, password: "", confirmPassword: "" }));
    setAuthMode("signin");
    setAuthInfo("Salasana vaihdettu. Kirjaudu nyt sisään uudella salasanalla.");
  };

  const handleLogout = async () => {
    await clearBrokenSession();
    setProfile(null);
    setSession(null);
    setAvailableRoleOptions([]);
    setRoleSelectionOpen(false);
  };

  const handleRoleSelect = async (selectedRole) => {
    if (!profile || !selectedRole) return;
    setAuthError("");
    setAuthInfo("");

    const currentRole = getMatchingAllowedRole(availableRoleOptions, profile);
    if (currentRole?.id === selectedRole.id) {
      setRoleSelectionOpen(false);
      return;
    }

    const { data: updatedProfile, error } = await supabase
      .from("profiles")
      .update({
        role: selectedRole.role,
        buyer_id: selectedRole.buyer_id || null,
        is_active: selectedRole.is_active,
      })
      .eq("id", profile.id)
      .select("*")
      .single();

    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setAuthError(error.message);
      return;
    }

    const normalizedUpdatedProfile = {
      ...updatedProfile,
      email: normalizeEmail(updatedProfile.email || profile.email || ""),
    };
    setProfile(normalizedUpdatedProfile);
    setRoleSelectionOpen(false);
    setAccountPanelOpen(false);
    setActiveTab("dashboard");
    setRefreshTick((prev) => prev + 1);
    setAuthInfo(`Rooli vaihdettu: ${buildRoleOptionLabel(selectedRole, buyers)}`);
  };

  const handleSaveOwnDetails = async () => {
    if (!profile) return;
    setAuthError("");
    setAuthInfo("");

    const displayName = accountForm.displayName.trim();
    if (!displayName) {
      setAuthError("Täytä vähintään nimi.");
      return;
    }

    setAccountSaving(true);
    try {
      const vesselIds = parseCommercialFishingVesselIds(accountForm.commercialFishingVesselIdsText);
      const vesselIdsText = vesselIds.join("\n");
      const profilePayload = {
        display_name: displayName,
        ...(profile.role === "processor"
          ? {
              evira_facility_id: accountForm.eviraFacilityId.trim() || null,
              pickup_address: accountForm.pickupAddress.trim() || null,
              company_name: accountForm.companyName.trim() || null,
              business_id: accountForm.businessId.trim() || null,
              address: accountForm.address.trim() || null,
              postcode: accountForm.postcode.trim() || null,
              city: accountForm.city.trim() || null,
              billing_address: accountForm.billingAddress.trim() || null,
              billing_postcode: accountForm.billingPostcode.trim() || null,
              billing_city: accountForm.billingCity.trim() || null,
              billing_email: accountForm.billingEmail.trim().toLowerCase() || null,
              einvoice_address: accountForm.einvoiceAddress.trim() || null,
              contact_email: accountForm.contactEmail.trim().toLowerCase() || null,
              phone: accountForm.phone.trim() || null,
            }
          : profile.role !== "buyer"
            ? {
              commercial_fishing_vessel_id: vesselIdsText || null,
              commercial_fishing_id: accountForm.commercialFishingId.trim() || null,
              pickup_address: accountForm.pickupAddress.trim() || null,
              company_name: accountForm.companyName.trim() || null,
              business_id: accountForm.businessId.trim() || null,
              address: accountForm.address.trim() || null,
              postcode: accountForm.postcode.trim() || null,
              city: accountForm.city.trim() || null,
              billing_address: accountForm.billingAddress.trim() || null,
              billing_postcode: accountForm.billingPostcode.trim() || null,
              billing_city: accountForm.billingCity.trim() || null,
              billing_email: accountForm.billingEmail.trim().toLowerCase() || null,
              einvoice_address: accountForm.einvoiceAddress.trim() || null,
              contact_email: accountForm.contactEmail.trim().toLowerCase() || null,
              phone: accountForm.phone.trim() || null,
            }
          : {}),
      };

      const { data: updatedProfile, error: profileUpdateError } = await supabase
        .from("profiles")
        .update(profilePayload)
        .eq("id", profile.id)
        .select("*")
        .single();
      if (profileUpdateError) {
        if (isMissingRefreshTokenError(profileUpdateError)) {
          await invalidateSession();
          return;
        }
        throw profileUpdateError;
      }

      if (profile.role === "buyer" && linkedBuyerRecord?.id) {
        const buyerPayload = {
          company_name: accountForm.companyName.trim(),
          contact_name: accountForm.contactName.trim(),
          phone: accountForm.phone.trim(),
          city: accountForm.city.trim(),
          delivery_address: accountForm.deliveryAddress.trim(),
          delivery_postcode: accountForm.deliveryPostcode.trim(),
          delivery_city: accountForm.deliveryCity.trim(),
          billing_address: accountForm.billingAddress.trim(),
          billing_postcode: accountForm.billingPostcode.trim(),
          billing_city: accountForm.billingCity.trim(),
          billing_email: accountForm.billingEmail.trim().toLowerCase(),
          business_id: accountForm.businessId.trim(),
          notes: accountForm.notes.trim(),
        };
        if (!buyerPayload.company_name) {
          setAuthError("Täytä yrityksen nimi.");
          setAccountSaving(false);
          return;
        }
        const { error: buyerUpdateError } = await supabase.from("buyers").update(buyerPayload).eq("id", linkedBuyerRecord.id);
        if (buyerUpdateError) {
          if (isMissingRefreshTokenError(buyerUpdateError)) {
            await invalidateSession();
            return;
          }
          throw buyerUpdateError;
        }
      }

      const normalizedUpdatedProfile = {
        ...updatedProfile,
        email: normalizeEmail(updatedProfile.email || profile.email || ""),
      };
      setProfile(normalizedUpdatedProfile);
      setAccountBillingSameAsDelivery(billingMatchesDelivery(accountForm));
      fisherInfoSyncingRef.current = true;
      setFisherInfoForm({
        commercialFishingId: normalizedUpdatedProfile.commercial_fishing_id || "",
        commercialFishingVesselId: normalizedUpdatedProfile.commercial_fishing_vessel_id || "",
        commercialFishingVesselIdsText: getCommercialFishingVesselIds(normalizedUpdatedProfile).join("\n"),
        eviraFacilityId: normalizedUpdatedProfile.evira_facility_id || "",
      });
      setAccountFormDirty(false);
      setFisherInfoDirty(false);
      setRefreshTick((prev) => prev + 1);
      setAuthInfo("Omat tiedot tallennettu.");
    } catch (error) {
      setAuthError(String(error?.message || error));
    } finally {
      setAccountSaving(false);
    }
  };

  const handleApprovePendingProfile = async (pendingProfile) => {
    if (!profile || profile.role !== "owner" || !pendingProfile?.id) return;
    setUserMessage("");
    const normalizedEmail = normalizeEmail(pendingProfile.email || "");
    const role = pendingProfile.role === "buyer" ? "buyer" : pendingProfile.role === "processor" ? "processor" : "member";
    let buyerId = pendingProfile.buyer_id || null;

    if (role === "buyer" && !buyerId) {
      const existingBuyer = buyers.find((buyer) => normalizeEmail(buyer.email) === normalizedEmail);
      if (existingBuyer) {
        buyerId = existingBuyer.id;
      } else {
        const buyerPayload = {
          company_name: pendingProfile.company_name || pendingProfile.display_name || normalizedEmail,
          buyer_type: "ravintola",
          contact_name: pendingProfile.display_name || "",
          email: normalizedEmail,
          phone: pendingProfile.phone || "",
          city: pendingProfile.city || "",
          is_active: true,
          notes: "Luotu itsepalvelurekisteröinnin hyväksynnässä.",
          delivery_address: pendingProfile.address || "",
          delivery_postcode: pendingProfile.postcode || "",
          delivery_city: pendingProfile.city || "",
          billing_address: pendingProfile.billing_address || "",
          billing_postcode: pendingProfile.billing_postcode || "",
          billing_city: pendingProfile.billing_city || "",
          billing_email: pendingProfile.billing_email || normalizedEmail,
          business_id: pendingProfile.business_id || "",
        };
        const { data: insertedBuyer, error: buyerInsertError } = await supabase.from("buyers").insert(buyerPayload).select("id").single();
        if (buyerInsertError) {
          if (isMissingRefreshTokenError(buyerInsertError)) {
            await invalidateSession();
            return;
          }
          setUserMessage(buyerInsertError.message);
          return;
        }
        buyerId = insertedBuyer?.id || null;
      }
    }

    const allowedPayload = {
      email: normalizedEmail,
      display_name: pendingProfile.display_name || normalizedEmail,
      role,
      is_active: true,
      buyer_id: role === "buyer" ? buyerId : null,
    };

    const { data: existingAllowedUsers, error: existingAllowedError } = await findAllowedUsersByEmail(supabase, normalizedEmail);
    if (existingAllowedError && existingAllowedError.code !== "PGRST116") {
      if (isMissingRefreshTokenError(existingAllowedError)) {
        await invalidateSession();
        return;
      }
      setUserMessage(existingAllowedError.message);
      return;
    }

    const exactRoleRow = (existingAllowedUsers || []).find((item) => (
      item.role === role && String(item.buyer_id || "") === String(allowedPayload.buyer_id || "")
    )) || null;

    const allowedResult = exactRoleRow
      ? await supabase.from("allowed_users").update(allowedPayload).eq("id", exactRoleRow.id)
      : await supabase.from("allowed_users").insert(allowedPayload);
    if (allowedResult.error) {
      if (isMissingRefreshTokenError(allowedResult.error)) {
        await invalidateSession();
        return;
      }
      setUserMessage(allowedResult.error.message);
      return;
    }

    const { error: profileUpdateError } = await supabase
      .from("profiles")
      .update({ is_active: true, role, buyer_id: role === "buyer" ? buyerId : null })
      .eq("id", pendingProfile.id);
    if (profileUpdateError) {
      if (isMissingRefreshTokenError(profileUpdateError)) {
        await invalidateSession();
        return;
      }
      setUserMessage(profileUpdateError.message);
      return;
    }

    setUserMessage(`Käyttäjä ${pendingProfile.display_name || pendingProfile.email} hyväksytty roolille ${roleLabel(role)}.`);
    setRefreshTick((prev) => prev + 1);
  };

  const handleChangePassword = async () => {
    setAuthError("");
    setAuthInfo("");

    const newPassword = passwordForm.newPassword;
    const confirmPassword = passwordForm.confirmPassword;
    if (!newPassword || !confirmPassword) {
      setAuthError("Täytä uusi salasana kahteen kertaan.");
      return;
    }
    if (newPassword.length < 8) {
      setAuthError("Salasanassa pitää olla vähintään 8 merkkiä.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setAuthError("Salasanat eivät täsmää.");
      return;
    }

    setPasswordSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        if (isMissingRefreshTokenError(error)) {
          await invalidateSession();
          return;
        }
        throw error;
      }
      setPasswordForm({ newPassword: "", confirmPassword: "" });
      setAuthInfo("Salasana vaihdettu.");
    } catch (error) {
      setAuthError(String(error?.message || error));
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleCreateAllowedUser = async () => {
    if (!profile || profile.role !== "owner") return;
    setUserMessage("");
    const email = normalizeEmail(newAllowedForm.email);
    const displayName = newAllowedForm.displayName.trim();
    if (!email || !displayName) {
      setUserMessage("Täytä sähköposti ja nimi.");
      return;
    }
    const role = newAllowedForm.role === "owner" ? "owner" : newAllowedForm.role === "buyer" ? "buyer" : newAllowedForm.role === "processor" ? "processor" : "member";
    if (role === "buyer" && !newAllowedForm.buyer_id) {
      setUserMessage("Valitse ostajakäyttäjälle ostajarekisterin yritys.");
      return;
    }
    const payload = {
      email,
      display_name: displayName,
      role,
      is_active: true,
      buyer_id: role === "buyer" ? newAllowedForm.buyer_id : null,
    };

    const { data: existingAllowedUsers, error: existingAllowedUserError } = await findAllowedUsersByEmail(supabase, email);

    if (existingAllowedUserError && existingAllowedUserError.code !== "PGRST116") {
      if (isMissingRefreshTokenError(existingAllowedUserError)) {
        await invalidateSession();
        return;
      }
      setUserMessage(existingAllowedUserError.message);
      return;
    }

    const exactRoleRow = (existingAllowedUsers || []).find((item) => (
      item.role === role && String(item.buyer_id || "") === String(payload.buyer_id || "")
    )) || null;

    const { error } = exactRoleRow
      ? await supabase.from("allowed_users").update(payload).eq("id", exactRoleRow.id)
      : await supabase.from("allowed_users").insert(payload);

    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setUserMessage(error.message);
      return;
    }
    setNewAllowedForm({ email: "", displayName: "", role: "member", buyer_id: "" });
    setUserMessage(exactRoleRow ? `Rooli ${buildRoleOptionLabel(payload, buyers)} päivitetty käyttäjälle ${displayName}.` : `Uusi rooli ${buildRoleOptionLabel(payload, buyers)} lisätty käyttäjälle ${displayName}.`);
    setRefreshTick((prev) => prev + 1);
  };

  const resetBuyerForm = () => {
    const nextForm = {
      id: "",
      company_name: "",
      buyer_type: "ravintola",
      contact_name: "",
      email: "",
      phone: "",
      city: "",
      min_kg: "",
      max_kg: "",
      is_active: true,
      notes: "",
      delivery_address: "",
      delivery_postcode: "",
      delivery_city: "",
      billing_address: "",
      billing_postcode: "",
      billing_city: "",
      billing_email: "",
      business_id: "",
    };
    setBuyerForm(nextForm);
    setBuyerBillingSameAsDelivery(buyerBillingMatchesDelivery(nextForm));
  };

  const startEditBuyer = (buyer) => {
    const nextForm = {
      id: buyer.id,
      company_name: buyer.company_name || "",
      buyer_type: buyer.buyer_type || "ravintola",
      contact_name: buyer.contact_name || "",
      email: buyer.email || "",
      phone: buyer.phone || "",
      city: buyer.city || "",
      min_kg: buyer.min_kg === "" || buyer.min_kg == null ? "" : String(buyer.min_kg),
      max_kg: buyer.max_kg === "" || buyer.max_kg == null ? "" : String(buyer.max_kg),
      is_active: Boolean(buyer.is_active),
      notes: buyer.notes || "",
      delivery_address: buyer.delivery_address || "",
      delivery_postcode: buyer.delivery_postcode || "",
      delivery_city: buyer.delivery_city || "",
      billing_address: buyer.billing_address || "",
      billing_postcode: buyer.billing_postcode || "",
      billing_city: buyer.billing_city || "",
      billing_email: buyer.billing_email || "",
      business_id: buyer.business_id || "",
    };
    setBuyerForm(nextForm);
    setBuyerBillingSameAsDelivery(buyerBillingMatchesDelivery(nextForm));
    setUserMessage(`Muokataan ostajaa: ${buyer.company_name}`);
  };

  const toggleBuyerActive = async (buyer) => {
    const { error } = await supabase.from("buyers").update({ is_active: !buyer.is_active }).eq("id", buyer.id);
    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setUserMessage(error.message);
      return;
    }
    setRefreshTick((prev) => prev + 1);
  };

  const deleteBuyer = async (buyer) => {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(`Poistetaanko ostaja ${buyer.company_name || buyer.email} kokonaan?`);
      if (!confirmed) return;
    }

    const unlinkOperations = [
      supabase.from("allowed_users").update({ buyer_id: null }).eq("buyer_id", buyer.id),
      supabase.from("profiles").update({ buyer_id: null }).eq("buyer_id", buyer.id),
      supabase.from("buyer_offers").update({ buyer_id: null }).eq("buyer_id", buyer.id),
    ];

    for (const operation of unlinkOperations) {
      const { error } = await operation;
      if (error) {
        if (isMissingRefreshTokenError(error)) {
          await invalidateSession();
          return;
        }
        setUserMessage(`Ostajan poisto epäonnistui: ${error.message}`);
        return;
      }
    }

    const { data: deletedRows, error } = await supabase
      .from("buyers")
      .delete()
      .eq("id", buyer.id)
      .select("id");
    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setUserMessage(`Ostajan poisto epäonnistui: ${error.message}`);
      return;
    }
    if (!deletedRows || deletedRows.length === 0) {
      setUserMessage("Ostajan poisto ei onnistunut. Riviä ei poistettu tietokannasta.");
      return;
    }
    if (buyerForm.id === buyer.id) {
      resetBuyerForm();
    }
    setUserMessage(`Ostaja ${buyer.company_name || buyer.email} poistettu kokonaan.`);
    setRefreshTick((prev) => prev + 1);
  };

  const handleSaveBuyer = async () => {
    if (!profile || profile.role !== "owner") return;
    const payload = {
      company_name: buyerForm.company_name.trim(),
      buyer_type: buyerForm.buyer_type,
      contact_name: buyerForm.contact_name.trim(),
      email: buyerForm.email.trim().toLowerCase(),
      phone: buyerForm.phone.trim(),
      city: buyerForm.city.trim(),
      min_kg: buyerForm.min_kg === "" ? null : Number(buyerForm.min_kg),
      max_kg: buyerForm.max_kg === "" ? null : Number(buyerForm.max_kg),
      is_active: buyerForm.is_active,
      notes: buyerForm.notes.trim(),
      delivery_address: (buyerForm.delivery_address || "").trim(),
      delivery_postcode: (buyerForm.delivery_postcode || "").trim(),
      delivery_city: (buyerForm.delivery_city || "").trim(),
      billing_address: (buyerForm.billing_address || "").trim(),
      billing_postcode: (buyerForm.billing_postcode || "").trim(),
      billing_city: (buyerForm.billing_city || "").trim(),
      billing_email: (buyerForm.billing_email || "").trim().toLowerCase(),
      business_id: (buyerForm.business_id || "").trim(),
    };

    if (!payload.company_name || !payload.email) {
      setUserMessage("Täytä ostajalle vähintään yritys ja sähköposti.");
      return;
    }

    let error;
    if (buyerForm.id) {
      const result = await supabase.from("buyers").update(payload).eq("id", buyerForm.id);
      error = result.error;
    } else {
      const result = await supabase.from("buyers").insert(payload);
      error = result.error;
    }

    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setUserMessage(error.message);
      return;
    }

    resetBuyerForm();
    setUserMessage(buyerForm.id ? "Ostajan tiedot päivitetty." : "Ostaja lisätty.");
    setRefreshTick((prev) => prev + 1);
  };

  const toggleAllowedUserActive = async (row) => {
    const { error } = await supabase.from("allowed_users").update({ is_active: !row.is_active }).eq("id", row.id);
    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setUserMessage(error.message);
      return;
    }
    setRefreshTick((prev) => prev + 1);
  };

  const deleteAllowedUser = async (row) => {
    if (normalizeEmail(row.email) === normalizeEmail(profile?.email)) {
      setUserMessage("Et voi poistaa omaa käyttäjääsi sallittujen käyttäjien listasta.");
      return;
    }
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(`Poistetaanko käyttäjä ${row.display_name || row.email} kokonaan?`);
      if (!confirmed) return;
    }
    const { error } = await supabase.from("allowed_users").delete().eq("id", row.id);
    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setUserMessage(error.message);
      return;
    }
    setUserMessage(`Käyttäjä ${row.display_name || row.email} poistettu kokonaan.`);
    setRefreshTick((prev) => prev + 1);
  };

  const sendCatchOfferEmail = async ({ formState, rows, profileState }) => {
    const recipientAnalysis = analyzeOfferRecipients(formState, rows);
    const recipients = recipientAnalysis.matching.map((recipient) => ({
      ...recipient,
      email: (recipient.email || "").trim().toLowerCase(),
    }));
    if (recipients.length === 0) {
      return { skipped: true, sent: [], failed: [], recipientAnalysis };
    }

    const summaryLines = rows
      .map((row) => formatSpeciesOfferSummaryLine({ ...row, catch_date: formState.date }))
      .join(String.fromCharCode(10));

    const totalKilos = rows.reduce((sum, row) => sum + Number(row.kilos || 0), 0);
    const productTotal = getOfferProductTotal(rows);
    const selectedOriginPoint = getOriginPointById(formState.originPointId);
    const offerUrlBase = getPublicAppBaseUrl();
    const logisticsLines = [
      `Lähtöpaikka: ${formState.originCity || formState.municipality || "-"}`,
      `Kilpailuta kuljetus: ${formState.deliveryPossible ? "Kyllä" : "Ei"}`,
      `Toimitustapa: ${formState.deliveryMethod || "-"}`,
      formState.transportMode ? `Kuljetus järjestetään: ${getTransportModeLabel(formState.transportMode)}` : "",
      selectedOriginPoint ? `Luovutuspiste: ${selectedOriginPoint.name} / ${selectedOriginPoint.address}` : "",
      selectedOriginPoint?.latest_dropoff_time ? `Viimeinen jättöaika: ${selectedOriginPoint.latest_dropoff_time}` : "",
      formState.estimatedPickupTime ? `Arvioitu noutoaika: ${formState.estimatedPickupTime}` : "",
      formState.pickupSurcharge !== "" ? `Noutolisä: ${formState.pickupSurcharge} €` : "",
      Array.isArray(formState.deliveryDestinations) && formState.deliveryDestinations.length > 0 ? `Toimituskohteet: ${formState.deliveryDestinations.join(", ")}` : "",
      `Toimitusalue: ${formState.deliveryArea || "-"}`,
      `Toimituskustannus: ${formState.deliveryCost !== "" ? `${formState.deliveryCost} €` : "-"}`,
      `Aikaisin toimitus: ${formState.earliestDeliveryDate || "-"}`,
      `Kylmäkuljetus: ${formState.coldTransport ? "Kyllä" : "Ei"}`,
      `Kaupallisen kalastajan tunnus: ${profileState?.commercial_fishing_id || "-"}`,
      `Paikkakunta: ${formState.municipality || "-"}`,
    ];

    const entry = {
      species: rows.map((row) => formatSpeciesForSale(getSpeciesRowLabel(row))).join(", "),
      kilos: totalKilos,
      line_items: rows.map((row) => ({
        species: formatSpeciesForSale(getSpeciesRowLabel(row)),
        kilos: Number(row.kilos || 0),
        count: Number(row.count || 0),
        price_per_kg: parseLocaleNumber(row.price_per_kg),
        price_unit: getSpeciesPriceUnit(getSpeciesRowLabel(row)),
        batch_id: row.batch_id || "",
        catch_date: formState.date || "",
      })),
      date: formState.date,
      dateLabel: "Pyyntipäivämäärä",
      area: formState.area,
      municipality: formState.municipality || "",
      originCity: formState.originCity || formState.municipality || "",
      spot: formState.spot || "",
      gear: formState.gear || "",
      price_per_kg: rows.length === 1 ? parseLocaleNumber(rows[0].price_per_kg) : null,
      productTotal,
      ownerName: profileState?.display_name || profileState?.email || "Tuntematon",
      commercialFishingId: profileState?.commercial_fishing_id || "",
      deliveryPossible: Boolean(formState.deliveryPossible),
      deliveryMethod: formState.deliveryMethod || "Nouto",
      transportMode: formState.transportMode || "",
      originPointId: formState.originPointId || "",
      transportCompanyId: formState.transportCompanyId || "",
      pickupSurcharge: formState.pickupSurcharge === "" ? null : Number(formState.pickupSurcharge),
      estimatedPickupTime: formState.estimatedPickupTime || "",
      deliveryDestinations: Array.isArray(formState.deliveryDestinations) ? formState.deliveryDestinations : [],
      deliveryArea: formState.deliveryArea || "",
      deliveryCost: parseLocaleNumber(formState.deliveryCost),
      earliestDeliveryDate: formState.earliestDeliveryDate || "",
      coldTransport: Boolean(formState.coldTransport),
      notes: [formState.notes || "", "", "Erän lajit:", summaryLines, "", "Toimitus:", ...logisticsLines].join(String.fromCharCode(10)).trim(),
      offerUrlBase,
    };

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) {
      throw new Error("Istunto puuttuu. Kirjaudu ulos ja takaisin sisään ennen tarjouksen lähetystä.");
    }

    const sent = [];
    const failed = [];

    for (const recipient of recipients) {
      const insertedOffer = await supabase
        .from("buyer_offers")
      .insert({
          batch_id: rows[0]?.batch_id || null,
          buyer_id: recipient.buyer_id || null,
          buyer_email: recipient.email,
          seller_user_id: profileState?.id || null,
          seller_name: profileState?.display_name || profileState?.email || null,
          total_kilos: entry.kilos,
          price_per_kg: entry.price_per_kg,
          seller_origin_city: entry.originCity || null,
          delivery_possible: Boolean(entry.deliveryPossible),
          species_summary: summaryLines,
          area: entry.area,
          spot: entry.spot,
          gear: entry.gear,
          delivery_method: entry.deliveryMethod || "Nouto",
          transport_mode: entry.transportMode || null,
          origin_point_id: entry.originPointId || null,
          transport_company_id: recipient.carrier_id || entry.transportCompanyId || null,
          delivery_destination_city: recipient.destination_city || null,
          delivery_destinations: entry.deliveryDestinations,
          route_price_eur: recipient.route_price_eur == null || recipient.route_price_eur === "" ? null : Number(recipient.route_price_eur),
          total_price_eur: recipient.total_price_eur == null || recipient.total_price_eur === "" ? null : Number(recipient.total_price_eur),
          delivered_price_per_kg: recipient.delivered_price_per_kg == null || recipient.delivered_price_per_kg === "" ? null : Number(recipient.delivered_price_per_kg),
          delivery_area: entry.deliveryArea || null,
          delivery_cost: entry.deliveryCost == null || entry.deliveryCost === "" ? null : Number(entry.deliveryCost),
          earliest_delivery_date: entry.earliestDeliveryDate || null,
          cold_transport: Boolean(entry.coldTransport),
          notes: entry.notes || null,
          status: "sent",
          billing_status: "unbilled",
        })
        .select("id")
        .single();

      if (insertedOffer.error) {
        failed.push({
          company_name: recipient.company_name,
          contact_name: recipient.contact_name,
          email: recipient.email,
          channel: recipient.channel,
          error: insertedOffer.error.message || "buyer_offers-rivin tallennus epäonnistui",
        });
        continue;
      }

      const offerId = insertedOffer?.data?.id || null;

      try {
        console.log("About to invoke send-catch-offer-email", {
          recipientEmail: recipient.email,
          recipientCompany: recipient.company_name,
          entry,
        });

        const { data, error } = await invokeEdgeFunctionAuthenticated(
          "send-catch-offer-email",
          {
            entry,
            recipients: [{
              email: recipient.email,
              company_name: recipient.company_name,
              offer_id: offerId,
              offer_link: offerId ? `${offerUrlBase}?offer=${offerId}` : null,
              delivery_destination_city: recipient.destination_city || "",
              route_price_eur: recipient.route_price_eur,
              total_price_eur: recipient.total_price_eur,
              delivered_price_per_kg: recipient.delivered_price_per_kg,
              carrier_name: recipient.carrier_name || "",
            }],
          },
          accessToken
        );

        console.log("Invoke result", { data, error });

        if (data?.results) {
          console.log("Function results", data.results);
        }

        const functionFailure = Array.isArray(data?.results)
          ? data.results.find((result) => result?.ok === false)
          : null;

        if (error || functionFailure || data?.ok === false) {
          failed.push({
            company_name: recipient.company_name,
            contact_name: recipient.contact_name,
            email: recipient.email,
            channel: recipient.channel,
            error:
              describeOfferEmailError(functionFailure?.error) ||
              describeOfferEmailError(error?.context?.error) ||
              describeOfferEmailError(error),
          });
        } else {
          sent.push({
            buyer_id: recipient.buyer_id,
            company_name: recipient.company_name,
            contact_name: recipient.contact_name,
            email: recipient.email,
            channel: recipient.channel,
            offer_id: offerId,
            offer_link: offerId ? `${offerUrlBase}?offer=${offerId}` : null,
            data,
          });
        }
      } catch (err) {
        console.error("Email sending failed", err);
        failed.push({
          company_name: recipient.company_name,
          contact_name: recipient.contact_name,
          email: recipient.email,
          channel: recipient.channel,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (failed.length > 0 && sent.length === 0) {
      throw new Error(failed.map((item) => `${item.company_name}: ${item.error}`).join(" | "));
    }

    return { skipped: false, sent, failed, recipientAnalysis };
  };

  const sendCatchOfferEmail_OLD = async ({ formState, rows, profileState, batchId }) => {
    const recipients = buildOfferRecipients(formState, rows).map((recipient) => ({
      ...recipient,
      email: (recipient.email || "").trim().toLowerCase(),
    }));
    if (recipients.length === 0) {
      return { skipped: true, sent: [], failed: [] };
    }

    const summaryLines = rows
      .map((row) => {
        const kilos = Number(row.kilos || 0);
        const count = Number(row.count || 0);
        return formatSpeciesSummaryLine(row.species, kilos, count);
      })
      .join(String.fromCharCode(10));

    const totalKilos = rows.reduce((sum, row) => sum + Number(row.kilos || 0), 0);
    const offerUrlBase = getPublicAppBaseUrl();
    const logisticsLines = [
      `Hinta: ${formState.price_per_kg !== "" && formState.price_per_kg != null ? `${formState.price_per_kg} € / kg` : "-"}`,
      `Toimitustapa: ${formState.deliveryMethod || "-"}`,
      `Toimitusalue: ${formState.deliveryArea || "-"}`,
      `Toimituskustannus: ${formState.deliveryCost !== "" ? `${formState.deliveryCost} €` : "-"}`,
      `Aikaisin toimitus: ${formState.earliestDeliveryDate || "-"}`,
      `Kylmäkuljetus: ${formState.coldTransport ? "Kyllä" : "Ei"}`,
      `Kaupallisen kalastajan tunnus: ${profileState?.commercial_fishing_id || "-"}`,
      `Paikkakunta: ${formState.municipality || "-"}`,
    ];

    const entry = {
      species: rows.map((row) => formatSpeciesForSale(row.species)).join(", "),
      kilos: totalKilos,
      date: formState.date,
      dateLabel: "Pyyntipäivämäärä",
      area: formState.area,
      municipality: formState.municipality || "",
      spot: formState.spot || "",
      gear: formState.gear || "",
      price_per_kg: parseLocaleNumber(formState.price_per_kg),
      ownerName: profileState?.display_name || profileState?.email || "Tuntematon",
      commercialFishingId: profileState?.commercial_fishing_id || "",
      deliveryMethod: formState.deliveryMethod || "Nouto",
      deliveryArea: formState.deliveryArea || "",
      deliveryCost: parseLocaleNumber(formState.deliveryCost),
      earliestDeliveryDate: formState.earliestDeliveryDate || "",
      coldTransport: Boolean(formState.coldTransport),
      notes: [formState.notes || "", "", "Erän lajit:", summaryLines, "", "Toimitus:", ...logisticsLines].join(String.fromCharCode(10)).trim(),
      offerUrlBase,
    };

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    const sent = [];
    const failed = [];

    for (const recipient of recipients) {
      const insertedOffer = await supabase
        .from("buyer_offers")
      .insert({
          batch_id: batchId,
          buyer_id: recipient.buyer_id || null,
          buyer_email: recipient.email,
          seller_user_id: profileState?.id || null,
          seller_name: profileState?.display_name || profileState?.email || null,
          total_kilos: entry.kilos,
          species_summary: summaryLines,
          area: entry.area,
          spot: entry.spot,
          gear: entry.gear,
          notes: entry.notes || null,
          status: "sent",
          billing_status: "unbilled",
        })
        .select("id")
        .single();

      if (insertedOffer.error) {
        failed.push({
          company_name: recipient.company_name,
          contact_name: recipient.contact_name,
          email: recipient.email,
          channel: recipient.channel,
          error: insertedOffer.error.message || "buyer_offers-rivin tallennus epäonnistui",
        });
        continue;
      }

      const offerId = insertedOffer?.data?.id || null;

      const { data, error } = await invokeEdgeFunctionAuthenticated(
        "send-catch-offer-email",
        {
          entry,
          recipients: [{
            email: recipient.email,
            company_name: recipient.company_name,
            offer_id: offerId,
            offer_link: offerId ? `${offerUrlBase}?offer=${offerId}` : null,
          }],
        },
        accessToken,
      );
      const functionFailure = Array.isArray(data?.results)
        ? data.results.find((result) => result?.ok === false)
        : null;

      if (!error && !functionFailure && data?.ok !== false) {
        console.log("send-catch-offer-email ok", recipient.email, data);
        sent.push({
          buyer_id: recipient.buyer_id,
          company_name: recipient.company_name,
          contact_name: recipient.contact_name,
          email: recipient.email,
          channel: recipient.channel,
          offer_id: offerId,
          offer_link: offerId ? `${offerUrlBase}?offer=${offerId}` : null,
          data,
        });
      } else {
        console.error("send-catch-offer-email error", recipient.email, error || functionFailure || data);
        failed.push({
          company_name: recipient.company_name,
          contact_name: recipient.contact_name,
          email: recipient.email,
          channel: recipient.channel,
          error:
            describeOfferEmailError(functionFailure?.error) ||
            describeOfferEmailError(error?.context?.error) ||
            describeOfferEmailError(error),
        });
      }
    }

    if (failed.length > 0 && sent.length === 0) {
      throw new Error(failed.map((item) => `${item.company_name}: ${item.error}`).join(" | "));
    }

    return { skipped: false, sent, failed };
  };

  const refreshBuyerOffers = async () => {
    const normalizedProfileEmail = (profile?.email || "").trim().toLowerCase();
    const query = profile?.role === "buyer"
      ? supabase
          .from("buyer_offers")
          .select("*")
          .eq("buyer_email", normalizedProfileEmail)
          .in("status", ["sent", "viewed", "countered", "reserved", "accepted", "rejected", "expired", "cancelled"])
          .order("created_at", { ascending: false })
      : supabase.from("buyer_offers").select("*").order("created_at", { ascending: false });

    const { data, error } = await query;
    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setAuthError(error.message);
      return;
    }

    setBuyerOffers((data || []).map((offer) => {
      const buyer = buyers.find((item) => item.id === offer.buyer_id || item.email === (offer.buyer_email || "").toLowerCase());
      return {
        ...offer,
        buyer_email: (offer.buyer_email || "").toLowerCase(),
        total_kilos: Number(offer.total_kilos || 0),
        price_per_kg: offer.price_per_kg == null ? "" : Number(offer.price_per_kg),
        counter_price_per_kg: offer.counter_price_per_kg == null ? "" : Number(offer.counter_price_per_kg),
        reserved_kilos: offer.reserved_kilos == null ? "" : Number(offer.reserved_kilos),
        delivery_method: offer.delivery_method || "Nouto",
        delivery_possible: Boolean(offer.delivery_possible),
        transport_mode: offer.transport_mode || "",
        origin_point_id: offer.origin_point_id || "",
        transport_company_id: offer.transport_company_id || "",
        seller_origin_city: offer.seller_origin_city || "",
        delivery_destination_city: offer.delivery_destination_city || "",
        route_price_eur: offer.route_price_eur == null ? "" : Number(offer.route_price_eur),
        total_price_eur: offer.total_price_eur == null ? "" : Number(offer.total_price_eur),
        delivered_price_per_kg: offer.delivered_price_per_kg == null ? "" : Number(offer.delivered_price_per_kg),
        delivery_destinations: Array.isArray(offer.delivery_destinations) ? offer.delivery_destinations : [],
        delivery_area: offer.delivery_area || "",
        delivery_cost: offer.delivery_cost == null ? "" : Number(offer.delivery_cost),
        earliest_delivery_date: offer.earliest_delivery_date || "",
        cold_transport: Boolean(offer.cold_transport),
        buyer_type: buyer?.buyer_type || "",
        buyer_company_name: buyer?.company_name || "",
        buyer_contact_name: buyer?.contact_name || "",
        buyer_phone: buyer?.phone || "",
        fulfillment_status: offer.fulfillment_status || (offer.status === "accepted" ? "awaiting_contact" : ""),
      };
    }));
  };

  const handleUpdateBillingStatus = async (offer, billingStatus) => {
    const patch = {
      billing_status: billingStatus,
      billed_at: billingStatus === "invoiced" ? new Date().toISOString() : null,
      paid_at: billingStatus === "paid" ? new Date().toISOString() : null,
      billing_month: offer.billing_month || (() => {
        try {
          const d = new Date(offer.updated_at || offer.created_at || new Date().toISOString());
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        } catch {
          return "";
        }
      })(),
      commission_rate: COMMISSION_RATE,
      trade_value: calculateCommissionDetails(offer).tradeValue,
      commission_amount: calculateCommissionDetails(offer).commissionValue,
    };

    const { error } = await supabase.from("buyer_offers").update(patch).eq("id", offer.id);
    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setAuthError(error.message);
      return;
    }

    setAuthInfo(
      billingStatus === "paid"
        ? "Kauppa merkitty maksetuksi."
        : billingStatus === "invoiced"
        ? "Kauppa merkitty laskutetuksi."
        : "Kauppa palautettu laskuttamattomaksi."
    );
    setRefreshTick((prev) => prev + 1);
  };

  const updateFulfillmentStatus = async (offer, fulfillmentStatus) => {
    const { error } = await supabase
      .from("buyer_offers")
      .update({ fulfillment_status: fulfillmentStatus })
      .eq("id", offer.id);

    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setAuthError(error.message);
      return;
    }

    setAuthInfo(
      fulfillmentStatus === "delivery_agreed"
        ? "Toimitus merkitty sovituksi."
        : fulfillmentStatus === "delivered"
        ? "Kauppa merkitty toimitetuksi."
        : "Toimituksen tila päivitetty."
    );
    await refreshBuyerOffers();
    setRefreshTick((prev) => prev + 1);
  };

  const buyerUpdateOffer = async (offerId, patch) => {
    const { error } = await supabase.from("buyer_offers").update(patch).eq("id", offerId);
    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return false;
      }
      setAuthError(error.message);
      return false;
    }
    await refreshBuyerOffers();
    setRefreshTick((prev) => prev + 1);
    return true;
  };

  const sendBuyerResponseEmail = async (offer, actionLabel) => {
    let sellerEmail = null;

    if (offer?.seller_user_id) {
      const { data: sellerProfile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", offer.seller_user_id)
        .maybeSingle();
      sellerEmail = sellerProfile?.email || null;
    }

    if (!sellerEmail) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    const revealIdentity = offer?.status === "accepted";
    const buyerLabel = revealIdentity
      ? (offer?.buyer_company_name || offer?.buyer_email || "Ostaja")
      : (offer?.buyer_type === "ravintola"
        ? "Anonyymi ravintola"
        : offer?.buyer_type === "tukku"
        ? "Anonyymi tukku"
        : offer?.buyer_type === "kauppa"
        ? "Anonyymi kauppa"
        : "Anonyymi ostaja");

    await supabase.functions.invoke("send-buyer-response-email", {
      body: {
        sellerEmail,
        offerLink: `${getPublicAppBaseUrl()}?offer=${offer.id}`,
        offer: {
          buyerLabel,
          buyerEmail: revealIdentity ? offer?.buyer_email : null,
          buyerPhone: revealIdentity ? offer?.buyer_phone : null,
          species_summary: offer?.species_summary,
          total_kilos: offer?.total_kilos,
          area: offer?.area,
          spot: offer?.spot,
          counter_price_per_kg: offer?.counter_price_per_kg,
          reserved_kilos: offer?.reserved_kilos,
          buyer_message: offer?.buyer_message,
          status: offer?.status,
          actionLabel,
        },
      },
    }).catch(() => null);
  };

  const sendBuyerAcceptedEmail = async (offer) => {
    const buyerEmail = (offer?.buyer_email || "").trim().toLowerCase();
    if (!buyerEmail) return;

    let sellerEmail = "";
    if (offer?.seller_user_id) {
      const { data: sellerProfile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", offer.seller_user_id)
        .maybeSingle();
      sellerEmail = sellerProfile?.email || "";
    }

    const sellerInfo = getBuyerVisibleSellerInfo({ ...offer, status: "accepted" });
    const sellerName = sellerInfo.sellerName || profile?.display_name || profile?.email || offer?.seller_name || "Myyja";
    const tradeValue = euro(calculateCommissionDetails(offer).tradeValue);
    const acceptedKilos = Number(offer?.reserved_kilos || offer?.total_kilos || 0);
    const batchId = offer?.batch_id || "";

    const { error } = await supabase.functions.invoke("send-buyer-accepted-email", {
      body: {
        buyerEmail,
        offerLink: `${getPublicAppBaseUrl()}?offer=${offer.id}`,
        offer: {
          sellerName,
          sellerEmail,
          sellerCommercialFishingId: sellerInfo.sellerCommercialFishingId,
          species_summary: offer?.species_summary,
          total_kilos: offer?.total_kilos,
          accepted_kilos: acceptedKilos,
          area: sellerInfo.sellerArea || offer?.area,
          spot: sellerInfo.sellerSpot || offer?.spot,
          delivery_method: sellerInfo.deliveryMethod,
          delivery_area: sellerInfo.deliveryArea,
          delivery_cost: sellerInfo.deliveryCost,
          earliest_delivery_date: sellerInfo.earliestDeliveryDate,
          cold_transport: sellerInfo.coldTransport,
          public_location: sellerInfo.publicLocation,
          counter_price_per_kg: offer?.counter_price_per_kg,
          reserved_kilos: offer?.reserved_kilos,
          trade_value: tradeValue,
          batch_id: batchId,
          qr_image_url: getBatchQrImageUrl(batchId),
          buyer_delivery_address: offer?.buyer_delivery_address,
          buyer_delivery_postcode: offer?.buyer_delivery_postcode,
          buyer_delivery_city: offer?.buyer_delivery_city,
          buyer_billing_address: offer?.buyer_billing_address,
          buyer_billing_postcode: offer?.buyer_billing_postcode,
          buyer_billing_city: offer?.buyer_billing_city,
          buyer_billing_email: offer?.buyer_billing_email,
          fulfillment_status: offer?.fulfillment_status || "awaiting_contact",
          status: "accepted",
        },
      },
    });

    if (error) {
      throw new Error(error.message || "Hyväksyntäsähköpostin lähetys epäonnistui.");
    }
  };

  const onSubmitCounter = async (offer) => {
    const price = parseLocaleNumber(buyerAction.counter_price_per_kg);
    const msg = buyerAction.buyer_message?.trim() || null;
    const ok = await buyerUpdateOffer(offer.id, {
      status: "countered",
      counter_price_per_kg: price,
      buyer_message: msg,
    });
    if (ok) {
      const updatedOffer = { ...offer, status: "countered", counter_price_per_kg: price, buyer_message: msg };
      await sendBuyerResponseEmail(updatedOffer, "Ostaja teki vastatarjouksen");
      setAuthInfo("Vastatarjous lähetetty myyjälle.");
      setBuyerAction({ counter_price_per_kg: "", reserved_kilos: "", buyer_message: "" });
      setBuyerActiveOfferId(null);
    }
  };

  const onReserve = async (offer) => {
    const reserved = isMixedOffer(offer)
      ? Number(offer.total_kilos || 0)
      : buyerAction.reserved_kilos === ""
      ? Number(offer.total_kilos || 0)
      : Number(buyerAction.reserved_kilos);
    const msg = buyerAction.buyer_message?.trim() || null;
    const ok = await buyerUpdateOffer(offer.id, {
      status: "reserved",
      reserved_kilos: reserved,
      buyer_message: msg,
    });
    if (ok) {
      const updatedOffer = { ...offer, status: "reserved", reserved_kilos: reserved, buyer_message: msg };
      await sendBuyerResponseEmail(updatedOffer, "Ostaja varasi erän");
      setAuthInfo("Erä varattu. Myyjälle näkyy varaus.");
      setBuyerAction({ counter_price_per_kg: "", reserved_kilos: "", buyer_message: "" });
      setBuyerActiveOfferId(null);
    }
  };

  const onRejectBuyerOffer = async (offer) => {
    const ok = await buyerUpdateOffer(offer.id, { status: "rejected" });
    if (ok) {
      await sendBuyerResponseEmail({ ...offer, status: "rejected" }, "Ostaja hylkäsi tarjouksen");
      setAuthInfo("Tarjous hylätty.");
    }
  };

  const handleCreateOffer = async (entry) => {
    setAuthError("");
    setAuthInfo("");
    if (!offerForm.company_name || !offerForm.contact_name || !offerForm.contact_email || !offerForm.offer_price_per_kg) {
      setAuthError("Täytä vähintään yritys, yhteyshenkilö, sähköposti ja tarjous €/kg.");
      return;
    }
    const { error } = await supabase.from("wholesale_offers").insert({
      entry_id: entry.id,
      company_name: offerForm.company_name,
      contact_name: offerForm.contact_name,
      contact_email: offerForm.contact_email,
      contact_phone: offerForm.contact_phone,
      offer_price_per_kg: parseLocaleNumber(offerForm.offer_price_per_kg) || 0,
      message: offerForm.message,
      created_by_user_id: profile?.id || null,
      status: "pending",
    });
    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setAuthError(error.message);
      return;
    }
    setOfferForm({ company_name: "", contact_name: "", contact_email: "", contact_phone: "", offer_price_per_kg: "", message: "" });
    setAuthInfo("Tarjous lähetetty.");
    setRefreshTick((prev) => prev + 1);
  };

  const onUpdateOfferStatus = async (offer, status) => {
    const { error } = await supabase.from("wholesale_offers").update({ status }).eq("id", offer.id);
    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setAuthError(error.message);
      return;
    }
    setRefreshTick((prev) => prev + 1);
  };

  const onUpdateBuyerOfferStatus = async (offer, status) => {
    let updatePayload = { status };

    if (status === "accepted") {
      const buyerRecord = buyers.find((buyer) => buyer.id === offer.buyer_id || buyer.email === (offer.buyer_email || "").toLowerCase());

      updatePayload = {
        ...updatePayload,
        fulfillment_status: offer.fulfillment_status || "awaiting_contact",
      };

      if (buyerRecord) {
        updatePayload = {
          ...updatePayload,
          buyer_delivery_address: buyerRecord.delivery_address || null,
          buyer_delivery_postcode: buyerRecord.delivery_postcode || null,
          buyer_delivery_city: buyerRecord.delivery_city || null,
          buyer_billing_address: buyerRecord.billing_address || null,
          buyer_billing_postcode: buyerRecord.billing_postcode || null,
          buyer_billing_city: buyerRecord.billing_city || null,
          buyer_billing_email: buyerRecord.billing_email || null,
          buyer_business_id: buyerRecord.business_id || null,
        };
      }
    }

    const { error } = await supabase
      .from("buyer_offers")
      .update(updatePayload)
      .eq("id", offer.id);

    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setAuthError(error.message);
      return;
    }

    if (status === "accepted") {
      const { data: openOffers, error: openOffersError } = await supabase
        .from("buyer_offers")
        .select("id, batch_id, seller_user_id, species_summary, total_kilos, area, spot, status")
        .eq("seller_user_id", offer.seller_user_id)
        .in("status", ["sent", "viewed", "countered", "reserved"]);

      if (openOffersError) {
        if (isMissingRefreshTokenError(openOffersError)) {
          await invalidateSession();
          return;
        }
        setAuthError(`Kauppa hyväksyttiin, mutta muiden saman erän tarjousten sulkeminen epäonnistui: ${openOffersError.message}`);
      } else {
        const competingOfferIds = (openOffers || [])
          .filter((candidate) => candidate.id !== offer.id && offersShareSameLot(offer, candidate))
          .map((candidate) => candidate.id);

        if (competingOfferIds.length > 0) {
          const { error: competingOffersError } = await supabase
            .from("buyer_offers")
            .update({ status: "sold" })
            .in("id", competingOfferIds);

          if (competingOffersError) {
            if (isMissingRefreshTokenError(competingOffersError)) {
              await invalidateSession();
              return;
            }
            setAuthError(`Kauppa hyväksyttiin, mutta muiden saman erän tarjousten sulkeminen epäonnistui: ${competingOffersError.message}`);
          }
        }
      }
    }

    setAuthInfo(
      status === "accepted"
        ? "Kauppa hyväksytty. Ostajan toimitus- ja laskutustiedot tallennettu kaupalle."
        : status === "rejected"
        ? "Tarjous hylätty."
        : "Tarjouksen tila päivitetty."
    );

    if (status === "accepted") {
      try {
        await sendBuyerAcceptedEmail({ ...offer, ...updatePayload, status: "accepted" });
      } catch (emailError) {
        setAuthError(`Kauppa hyväksyttiin, mutta vahvistussähköpostin lähetys epäonnistui: ${String(emailError?.message || emailError)}`);
      }
    }

    await refreshBuyerOffers();
    setRefreshTick((prev) => prev + 1);
  };

  const sendProcessedOfferEmail = async ({ formState, profileState, batchId }) => {
    const rows = [{ species: formState.productName || formState.productType || "Jaloste-erä", kilos: formState.kilos, count: formState.packageCount }];
    const recipientAnalysis = analyzeOfferRecipients({
      offerToShops: formState.offerToShops,
      offerToRestaurants: formState.offerToRestaurants,
      offerToWholesalers: formState.offerToWholesalers,
      deliveryPossible: Boolean(formState.deliveryPossible),
      deliveryMethod: formState.deliveryMethod || "Nouto",
      originPointId: formState.originPointId || "",
      deliveryDestinations: formState.deliveryDestinations || [],
    }, rows);
    const productTotal = getOfferProductTotal(rows);
    const selectedOriginPoint = getOriginPointById(formState.originPointId);
    const recipients = recipientAnalysis.matching.map((recipient) => ({
      ...recipient,
      email: (recipient.email || "").trim().toLowerCase(),
    }));

    if (recipients.length === 0) {
      return { skipped: true, sent: [], failed: [], recipientAnalysis };
    }

    const offerUrlBase = getPublicAppBaseUrl();
    const summaryLines = [
      `Tuote: ${formState.productName || "-"}`,
      `Tyyppi: ${formState.productType || "-"}`,
      `Käsittely: ${formState.processingMethod || "-"}`,
      `Raaka-aine: ${formState.speciesSummary || "-"}`,
      `Määrä: ${formState.kilos || 0} kg`,
      `Pakkauskoko: ${formState.packageSizeG || "-"} g`,
      `Pakkausten määrä: ${formState.packageCount || "-"}`,
      `Tuotantopäivä: ${formState.productionDate || "-"}`,
      `Parasta ennen: ${formState.bestBeforeDate || "-"}`,
    ].join(String.fromCharCode(10));

    const notes = [
      formState.notes || "",
      "",
      `Lähtöpaikka: ${formState.originCity || formState.municipality || "-"}`,
      `Kilpailuta kuljetus: ${formState.deliveryPossible ? "Kyllä" : "Ei"}`,
      "Toimitus:",
      `Toimitustapa: ${formState.deliveryMethod || "-"}`,
      formState.transportMode ? `Kuljetus järjestetään: ${getTransportModeLabel(formState.transportMode)}` : "",
      selectedOriginPoint ? `Luovutuspiste: ${selectedOriginPoint.name} / ${selectedOriginPoint.address}` : "",
      formState.transportMode === "pickup" ? `Nouto-osoite: ${resolvedProcessedPickupAddress || "-"}` : "",
      formState.estimatedPickupTime ? `Arvioitu noutoaika: ${formState.estimatedPickupTime}` : "",
      formState.pickupSurcharge !== "" ? `Noutolisä: ${formState.pickupSurcharge} €` : "",
      Array.isArray(formState.deliveryDestinations) && formState.deliveryDestinations.length > 0 ? `Toimituskohteet: ${formState.deliveryDestinations.join(", ")}` : "",
      `Toimitusalue: ${formState.deliveryArea || "-"}`,
      `Toimituskustannus: ${formState.deliveryCost !== "" ? `${formState.deliveryCost} €` : "-"}`,
      `Aikaisin toimitus: ${formState.earliestDeliveryDate || "-"}`,
      `Kylmäkuljetus: ${formState.coldTransport ? "Kyllä" : "Ei"}`,
      `Paikkakunta: ${formState.municipality || "-"}`,
      `Käsittelypaikka: ${formState.spot || "-"}`,
    ].filter(Boolean).join(String.fromCharCode(10)).trim();

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    const sent = [];
    const failed = [];

    for (const recipient of recipients) {
      const insertedOffer = await supabase
        .from("buyer_offers")
        .insert({
          batch_id: batchId,
          buyer_id: recipient.buyer_id || null,
          buyer_email: recipient.email,
          seller_user_id: profileState?.id || null,
          seller_name: profileState?.display_name || profileState?.email || null,
          total_kilos: Number(formState.kilos || 0),
          species_summary: summaryLines,
          area: formState.area,
          spot: formState.spot,
          gear: `Jaloste / ${formState.processingMethod || formState.productType || "-"}`,
          seller_origin_city: formState.originCity || formState.municipality || null,
          delivery_possible: Boolean(formState.deliveryPossible),
          delivery_method: formState.deliveryMethod || "Nouto",
          transport_mode: formState.transportMode || null,
          origin_point_id: formState.originPointId || null,
          transport_company_id: recipient.carrier_id || formState.transportCompanyId || null,
          delivery_destination_city: recipient.destination_city || null,
          delivery_destinations: formState.deliveryDestinations || [],
          route_price_eur: recipient.route_price_eur == null || recipient.route_price_eur === "" ? null : Number(recipient.route_price_eur),
          total_price_eur: recipient.total_price_eur == null || recipient.total_price_eur === "" ? null : Number(recipient.total_price_eur),
          delivered_price_per_kg: recipient.delivered_price_per_kg == null || recipient.delivered_price_per_kg === "" ? null : Number(recipient.delivered_price_per_kg),
          delivery_area: formState.deliveryArea || null,
          delivery_cost: formState.deliveryCost === "" ? null : Number(formState.deliveryCost),
          earliest_delivery_date: formState.earliestDeliveryDate || null,
          cold_transport: Boolean(formState.coldTransport),
          notes,
          status: "sent",
          billing_status: "unbilled",
        })
        .select("id")
        .single();

      if (insertedOffer.error) {
        failed.push({
          company_name: recipient.company_name,
          contact_name: recipient.contact_name,
          email: recipient.email,
          channel: recipient.channel,
          error: insertedOffer.error.message || "buyer_offers-rivin tallennus epäonnistui",
        });
        continue;
      }

      const offerId = insertedOffer?.data?.id || null;

      const { data, error } = await invokeEdgeFunctionAuthenticated(
        "send-catch-offer-email",
        {
          entry: {
            species: formState.productName || formState.productType || "Jaloste-erä",
            kilos: Number(formState.kilos || 0),
            date: formState.productionDate,
            area: formState.area,
            municipality: formState.municipality || "",
            spot: formState.spot || "",
            gear: `Jaloste / ${formState.processingMethod || formState.productType || "-"}`,
            ownerName: profileState?.display_name || profileState?.email || "Tuntematon",
            commercialFishingId: profileState?.commercial_fishing_id || "",
            originCity: formState.originCity || formState.municipality || "",
            productTotal,
            deliveryPossible: Boolean(formState.deliveryPossible),
            deliveryMethod: formState.deliveryMethod || "Nouto",
            transportMode: formState.transportMode || "",
            originPointId: formState.originPointId || "",
            transportCompanyId: formState.transportCompanyId || "",
            pickupSurcharge: parseLocaleNumber(formState.pickupSurcharge),
            estimatedPickupTime: formState.estimatedPickupTime || "",
            deliveryDestinations: formState.deliveryDestinations || [],
            deliveryArea: formState.deliveryArea || "",
            deliveryCost: parseLocaleNumber(formState.deliveryCost),
            earliestDeliveryDate: formState.earliestDeliveryDate || "",
            coldTransport: Boolean(formState.coldTransport),
            notes: [summaryLines, "", notes].join(String.fromCharCode(10)).trim(),
            offerUrlBase,
          },
          recipients: [{
            email: recipient.email,
            company_name: recipient.company_name,
            offer_id: offerId,
            offer_link: offerId ? `${offerUrlBase}?offer=${offerId}` : null,
            delivery_destination_city: recipient.destination_city || "",
            route_price_eur: recipient.route_price_eur,
            total_price_eur: recipient.total_price_eur,
            delivered_price_per_kg: recipient.delivered_price_per_kg,
            carrier_name: recipient.carrier_name || "",
          }],
        },
        accessToken
      );
      if (!error) {
        console.log("send-catch-offer-email ok", recipient.email, data);
        sent.push({
          buyer_id: recipient.buyer_id,
          company_name: recipient.company_name,
          contact_name: recipient.contact_name,
          email: recipient.email,
          channel: recipient.channel,
          offer_id: offerId,
          offer_link: offerId ? `${offerUrlBase}?offer=${offerId}` : null,
          data,
        });
      } else {
        console.error("send-catch-offer-email error", recipient.email, error);
        failed.push({
          company_name: recipient.company_name,
          contact_name: recipient.contact_name,
          email: recipient.email,
          channel: recipient.channel,
          error: error?.context?.error || error?.message || "Tarjoussähköpostin lähetys epäonnistui",
        });
      }
    }

    if (failed.length > 0 && sent.length === 0) {
      throw new Error(failed.map((item) => `${item.company_name}: ${item.error}`).join(" | "));
    }

    return { skipped: false, sent, failed, recipientAnalysis };
  };

  const handleSave = async () => {
    if (!profile) return;
    const totalKilosForOffer = speciesRows.reduce((sum, row) => sum + Number(row.kilos || 0), 0);
    const selectedVesselId = form.fishingWithoutVessel ? "" : String(form.selectedVesselId || commercialFishingVesselOptions[0] || "").trim();
    const batchSourceIdentifier = form.fishingWithoutVessel
      ? String(profile.commercial_fishing_id || "").trim()
      : getPreferredBatchSourceIdentifier(profile, selectedVesselId);
    const validRows = speciesRows.filter((row) => {
      const kilos = Number(row.kilos || 0);
      const count = Number(row.count || 0);
      return isCrayfishSpecies(getSpeciesRowLabel(row)) ? kilos > 0 || count > 0 : kilos > 0;
    });
    if (!validRows.length) {
      setAuthError("Täytä saaliille määrä ennen tallennusta. Ravuille vähintään kappalemäärä, muille lajeille vähintään kilot.");
      return;
    }
    if (validRows.some((row) => row.species === "Muu" && !String(row.customSpecies || "").trim())) {
      setAuthError("Kirjoita kalalajin nimi kaikille riveille, joilla lajiksi on valittu Muu.");
      return;
    }
    if (shouldSendOffer && validRows.some((row) => parseLocaleNumber(row.price_per_kg) == null)) {
      setAuthError("Täytä hinta jokaiselle kalalajille ennen saaliin tallennusta.");
      return;
    }
    if (validRows.some((row) => isCrayfishSpecies(getSpeciesRowLabel(row)) && Number(row.count || 0) <= 0)) {
      setAuthError("Täytä kappalemäärä kaikille täplärapu- ja jokirapuerille ennen saaliin tallennusta.");
      return;
    }
    if (form.deliveryPossible && form.deliveryMethod === "Kuljetus järjestetään") {
      if (!currentOriginCity) {
        setAuthError("Valitse lähtöpaikka ennen toimitettavan erän tallennusta.");
        return;
      }
      if (!form.transportMode) {
        setAuthError("Valitse kuljetuksen luovutustapa ennen tarjouksen lähetystä.");
        return;
      }
      if (form.transportMode === "pickup" && !resolvedPickupAddress) {
        setAuthError("Täytä nouto-osoite ennen tarjouksen lähetystä.");
        return;
      }
      if ((form.transportMode === "terminal" || form.transportMode === "collection_point") && !form.originPointId) {
        setAuthError("Valitse terminaali tai keräilypiste ennen tarjouksen lähetystä.");
        return;
      }
      if (!Array.isArray(form.deliveryDestinations) || form.deliveryDestinations.length === 0) {
        setAuthError("Valitse vähintään yksi toimituskohde tai käytä Ehdota kohteet -toimintoa.");
        return;
      }
      const unsupportedDestinations = form.deliveryDestinations.filter((city) => !getRoutePrice(form.originPointId, city, totalKilosForOffer));
      if (unsupportedDestinations.length > 0) {
        setAuthError(`Toimitushinta puuttuu kohteille: ${unsupportedDestinations.join(", ")}`);
        return;
      }
    }
    if (form.fishingWithoutVessel && !String(profile.commercial_fishing_id || "").trim()) {
      setAuthError("Aseta kaupallisen kalastajan tunnus kohdassa Omat tiedot ennen eräkoodin luontia, kun kalastat ilman alusta.");
      return;
    }
    if (!form.fishingWithoutVessel && commercialFishingVesselOptions.length > 0 && !selectedVesselId) {
      setAuthError("Valitse käytetty kaupallinen kalastusalus ennen saaliin tallennusta.");
      return;
    }
    setSaving(true);
    let rowsWithBatchIds;
    try {
      rowsWithBatchIds = await Promise.all(validRows.map(async (row) => ({
        ...row,
        batch_id: await generateBatchId({
          sourceIdentifier: batchSourceIdentifier,
          date: form.date,
          speciesLabels: [getSpeciesRowLabel(row)],
          quantity: Number(row.kilos || 0) > 0 ? Number(row.kilos || 0) : Number(row.count || 0),
          supabaseClient: supabase,
          ownerUserId: profile.id,
          insertSeparatorAfterSource: Boolean(form.fishingWithoutVessel),
        }),
      })));
    } catch (error) {
      setSaving(false);
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setAuthError(error.message || "Batch ID:n luonti epäonnistui.");
      return;
    }
    const payload = rowsWithBatchIds.map((row) => ({
      offer_to_shops: form.offerToShops,
      offer_to_restaurants: form.offerToRestaurants,
      offer_to_wholesalers: form.offerToWholesalers,
      date: form.date,
      area: form.area,
      municipality: form.municipality,
      origin_city: form.originCity || form.municipality || null,
      spot: form.spot,
      species: getSpeciesRowLabel(row),
      kilos: Number(row.kilos || 0),
      count: Number(row.count || 0),
      gear: form.gear,
      delivery_possible: Boolean(form.deliveryPossible),
      delivery_method: form.deliveryMethod,
      transport_mode: form.transportMode || null,
      origin_point_id: form.originPointId || null,
      transport_company_id: form.transportCompanyId || null,
      pickup_address: resolvedPickupAddress || null,
      delivery_destinations: form.deliveryDestinations,
      delivery_area: form.deliveryArea,
      delivery_cost: parseLocaleNumber(form.deliveryCost),
      earliest_delivery_date: form.earliestDeliveryDate || null,
      cold_transport: form.coldTransport,
      commercial_fishing_id: profile.commercial_fishing_id || null,
      commercial_fishing_vessel_id: selectedVesselId || null,
      price_per_kg: parseLocaleNumber(row.price_per_kg),
      notes: form.notes,
      batch_id: row.batch_id,
      owner_user_id: profile.id,
      owner_name: profile.display_name,
    }));

    const { error } = await supabase.from("catch_entries").insert(payload);
    if (error) {
      setSaving(false);
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      if (String(error.message || "").includes("price_per_kg")) {
        setAuthError("Tietokanta vaatii vielä hinnan saaliserälle. Aja SQL Editorissa muutos, joka sallii tyhjän hinnan saaliskirjanpidossa: alter table public.catch_entries alter column price_per_kg drop not null;");
        return;
      }
      if (String(error.message || "").includes("commercial_fishing_vessel_id")) {
        setAuthError("Tietokannasta puuttuu saaliserän aluskenttä. Lisää SQL Editorissa catch_entries-tauluun commercial_fishing_vessel_id ennen tallennusta.");
        return;
      }
      setAuthError(error.message);
      return;
    }

    try {
      const emailResult = await sendCatchOfferEmail({
        formState: form,
        rows: rowsWithBatchIds,
        profileState: profile,
      });

      if (shouldSendOffer) {
        if (emailResult.skipped) {
          const excludedLines = (emailResult.recipientAnalysis?.excluded || []).map((item) => `• ${item.company_name} (${item.email}) – ${item.reason}`);
          const parts = ["Saalis tallennettu, mutta yhtään ostajaa ei täyttänyt tarjousehtoja."];
          if (excludedLines.length > 0) {
            parts.push("", "Pois rajatut ostajat:", ...excludedLines);
          }
          setAuthInfo(parts.join(String.fromCharCode(10)));
        } else {
          const sentLines = emailResult.sent.map((item) => `✔ ${item.company_name} (${item.email})`);
          const failedLines = emailResult.failed.map((item) => `✖ ${item.company_name} (${item.email}) – ${item.error}`);
          const parts = [`Saalis tallennettu. Tarjous lähetetty ${emailResult.sent.length} ostajalle.`];
          if (sentLines.length > 0) parts.push("", "Lähetetty:", ...sentLines);
          if (failedLines.length > 0) parts.push("", "Epäonnistui:", ...failedLines);
          if (failedLines.length > 0) {
            setAuthError(parts.join(String.fromCharCode(10)));
            setAuthInfo("");
          } else {
            setAuthInfo(parts.join(String.fromCharCode(10)));
          }
        }
      } else {
        setAuthInfo("Saalis tallennettu.");
      }
    } catch (emailError) {
      console.error("Sähköpostin lähetys epäonnistui:", emailError);
      setAuthError(`Saalis tallennettu, mutta tarjoussähköpostin lähetys epäonnistui: ${String(emailError?.message || emailError)}`);
      setAuthInfo("");
    }

    setSaving(false);
    setForm((prev) => ({
      ...prev,
      originCity: "",
      selectedVesselId: commercialFishingVesselOptions[0] || "",
      fishingWithoutVessel: false,
      notes: "",
      price_per_kg: "",
      date: today(),
      offerToShops: false,
      offerToRestaurants: false,
      offerToWholesalers: false,
      deliveryPossible: false,
      deliveryMethod: "Nouto",
      transportMode: "",
      originPointId: "",
      transportCompanyId: "north-fresh-logistics",
      pickupAddress: "",
      pickupSurcharge: "",
      estimatedPickupTime: "",
      deliveryDestinations: [],
      deliveryArea: "",
      deliveryCost: "",
      earliestDeliveryDate: today(),
      coldTransport: false,
    }));
    setSpeciesRows([createSpeciesRow()]);
    setRefreshTick((prev) => prev + 1);
    setActiveTab("entries");
  };

  const handleSaveProcessed = async () => {
    if (!profile) return;
    if (!processedForm.productName.trim() || Number(processedForm.kilos || 0) <= 0) {
      setAuthError("Täytä jaloste-erälle vähintään tuotenimi ja määrä kiloina.");
      return;
    }
    if (processedForm.deliveryPossible && processedForm.deliveryMethod === "Kuljetus järjestetään") {
      if (!currentProcessedOriginCity) {
        setAuthError("Valitse lähtöpaikka ennen toimitettavan jaloste-erän tallennusta.");
        return;
      }
      if (!processedForm.transportMode) {
        setAuthError("Valitse kuljetuksen luovutustapa ennen jaloste-erän tarjouksen lähetystä.");
        return;
      }
      if (processedForm.transportMode === "pickup" && !resolvedProcessedPickupAddress) {
        setAuthError("Täytä nouto-osoite ennen jaloste-erän tarjouksen lähetystä.");
        return;
      }
      if ((processedForm.transportMode === "terminal" || processedForm.transportMode === "collection_point") && !processedForm.originPointId) {
        setAuthError("Valitse terminaali tai keräilypiste ennen jaloste-erän tarjouksen lähetystä.");
        return;
      }
      if (!Array.isArray(processedForm.deliveryDestinations) || processedForm.deliveryDestinations.length === 0) {
        setAuthError("Valitse vähintään yksi toimituskohde jaloste-erälle tai käytä Ehdota kohteet -toimintoa.");
        return;
      }
      const unsupportedDestinations = processedForm.deliveryDestinations.filter((city) => !getRoutePrice(processedForm.originPointId, city, Number(processedForm.kilos || 0)));
      if (unsupportedDestinations.length > 0) {
        setAuthError(`Toimitushinta puuttuu kohteille: ${unsupportedDestinations.join(", ")}`);
        return;
      }
    }

    setSaving(true);
    let batchId;
    try {
      batchId = await generateBatchId({
        sourceIdentifier: getPreferredBatchSourceIdentifier(profile),
        date: processedForm.productionDate,
        speciesLabels: (processedForm.speciesSummary
          .split("\n")
          .map((row) => String(row).split(":")[0].trim())
          .filter(Boolean).length > 0
          ? processedForm.speciesSummary
              .split("\n")
              .map((row) => String(row).split(":")[0].trim())
              .filter(Boolean)
          : [processedForm.productName]),
        quantity: processedForm.kilos,
        supabaseClient: supabase,
        ownerUserId: profile.id,
      });
    } catch (error) {
      setSaving(false);
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setAuthError(error.message || "Batch ID:n luonti epäonnistui.");
      return;
    }
    const payload = {
      batch_id: batchId,
      production_date: processedForm.productionDate,
      best_before_date: processedForm.bestBeforeDate || null,
      area: processedForm.area,
      municipality: processedForm.municipality,
      origin_city: processedForm.originCity || processedForm.municipality || null,
      spot: processedForm.spot,
      product_name: processedForm.productName.trim(),
      product_type: processedForm.productType,
      processing_method: processedForm.processingMethod,
      species_summary: processedForm.speciesSummary.trim(),
      kilos: Number(processedForm.kilos || 0),
      package_size_g: processedForm.packageSizeG === "" ? null : Number(processedForm.packageSizeG),
      package_count: processedForm.packageCount === "" ? null : Number(processedForm.packageCount),
      notes: processedForm.notes,
      offer_to_shops: processedForm.offerToShops,
      offer_to_restaurants: processedForm.offerToRestaurants,
      offer_to_wholesalers: processedForm.offerToWholesalers,
      delivery_possible: Boolean(processedForm.deliveryPossible),
      delivery_method: processedForm.deliveryMethod,
      transport_mode: processedForm.transportMode || null,
      origin_point_id: processedForm.originPointId || null,
      transport_company_id: processedForm.transportCompanyId || null,
      pickup_address: resolvedProcessedPickupAddress || null,
      delivery_destinations: processedForm.deliveryDestinations,
      delivery_area: processedForm.deliveryArea,
      delivery_cost: processedForm.deliveryCost === "" ? null : Number(processedForm.deliveryCost),
      earliest_delivery_date: processedForm.earliestDeliveryDate || null,
      cold_transport: processedForm.coldTransport,
      commercial_fishing_id: profile.commercial_fishing_id || null,
      owner_user_id: profile.id,
      owner_name: profile.display_name,
    };

    const { data: insertedProcessedBatch, error } = await supabase.from("processed_batches").insert(payload).select("id").single();
    if (error) {
      setSaving(false);
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setAuthError(error.message);
      return;
    }

    if (selectedProcessedSourceEntries.length > 0) {
      const sourcePayload = selectedProcessedSourceEntries.map((entry) => ({
        processed_batch_id: insertedProcessedBatch.id,
        source_entry_id: entry.id,
        source_batch_id: entry.batchId,
        source_species: entry.species,
        source_kilos: Number(entry.kilos || 0),
      }));
      const { error: sourceInsertError } = await supabase.from("processed_batch_sources").insert(sourcePayload);
      if (sourceInsertError) {
        setSaving(false);
        if (isMissingRefreshTokenError(sourceInsertError)) {
          await invalidateSession();
          return;
        }
        setAuthError(sourceInsertError.message);
        return;
      }
    }

    try {
      const emailResult = await sendProcessedOfferEmail({ formState: processedForm, profileState: profile, batchId });
      if (shouldSendProcessedOffer) {
        if (emailResult.skipped) {
          const excludedLines = (emailResult.recipientAnalysis?.excluded || []).map((item) => `• ${item.company_name} (${item.email}) – ${item.reason}`);
          const parts = ["Jaloste-erä tallennettu, mutta yhtään ostajaa ei täyttänyt tarjousehtoja."];
          if (excludedLines.length > 0) {
            parts.push("", "Pois rajatut ostajat:", ...excludedLines);
          }
          setAuthInfo(parts.join(String.fromCharCode(10)));
        } else {
          const sentLines = emailResult.sent.map((item) => `✔ ${item.company_name} (${item.email})`);
          const failedLines = emailResult.failed.map((item) => `✖ ${item.company_name} (${item.email}) – ${item.error}`);
          const parts = [`Jaloste-erä tallennettu. Tarjous lähetetty ${emailResult.sent.length} ostajalle.`];
          if (sentLines.length > 0) parts.push("", "Lähetetty:", ...sentLines);
          if (failedLines.length > 0) parts.push("", "Epäonnistui:", ...failedLines);
          if (failedLines.length > 0) {
            setAuthError(parts.join(String.fromCharCode(10)));
            setAuthInfo("");
          } else {
            setAuthInfo(parts.join(String.fromCharCode(10)));
          }
        }
      } else {
        setAuthInfo("Jaloste-erä tallennettu.");
      }
    } catch (emailError) {
      setAuthError(`Jaloste-erä tallennettu, mutta tarjoussähköpostin lähetys epäonnistui: ${String(emailError?.message || emailError)}`);
      setAuthInfo("");
    }

    setSaving(false);
    setProcessedForm({
      productionDate: today(),
      bestBeforeDate: "",
      area: "Saimaa",
      municipality: "",
      originCity: "",
      spot: "",
      productName: "",
      productType: "Filee",
      processingMethod: "Fileointi",
      speciesSummary: "",
      kilos: "",
      packageSizeG: "",
      packageCount: "",
      notes: "",
      offerToShops: false,
      offerToRestaurants: false,
      offerToWholesalers: false,
      deliveryPossible: false,
      deliveryMethod: "Nouto",
      transportMode: "",
      originPointId: "",
      transportCompanyId: "north-fresh-logistics",
      pickupAddress: "",
      pickupSurcharge: "",
      estimatedPickupTime: "",
      deliveryDestinations: [],
      deliveryArea: "",
      deliveryCost: "",
      earliestDeliveryDate: today(),
      coldTransport: true,
      sourceEntryIds: [],
    });
    setRefreshTick((prev) => prev + 1);
    setActiveTab("entries");
  };

  const handleDeleteProcessedEntry = async (entry) => {
    const ok = window.confirm(`Poistetaanko jaloste-erä: ${entry.productName} ${entry.kilos} kg / ${entry.productionDate}?`);
    if (!ok) return;

    const { error } = await supabase.from("processed_batches").delete().eq("id", entry.id);
    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setAuthError(error.message);
      return;
    }

    setAuthInfo("Jaloste-erä poistettu.");
    setRefreshTick((prev) => prev + 1);
  };

  const handleDeleteEntry = async (entry) => {
    const ok = window.confirm(`Poistetaanko saalistieto: ${formatSpeciesForSale(entry.species)} ${entry.kilos} kg / ${entry.date}?`);
    if (!ok) return;

    const { error } = await supabase.from("catch_entries").delete().eq("id", entry.id);
    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setAuthError(error.message);
      return;
    }

    setAuthInfo("Saalistieto poistettu.");
    setRefreshTick((prev) => prev + 1);
  };

  const openCatchLabelPrintDialog = (entry, mode = "print") => {
    if (!entry) return;
    if (mode === "pdf") {
      void (async () => {
        try {
          const doc = await buildCatchLabelPdf(entry, profile, labelPrintCount);
          const blobUrl = doc.output("bloburl");
          const pdfWindow = window.open(blobUrl, "_blank");
          if (!pdfWindow) {
            doc.save(buildCatchLabelPdfFileName(entry));
            return;
          }
          window.setTimeout(() => {
            try {
              window.URL.revokeObjectURL(blobUrl);
            } catch {
              // ignore
            }
          }, 60000);
        } catch (error) {
          console.error("Etiketti-PDF:n luonti epäonnistui:", error);
          setAuthError(`Etiketti-PDF:n luonti epäonnistui: ${String(error?.message || error)}`);
        }
      })();
      return;
    }
    const html = buildCatchLabelPrintHtml(entry, profile, labelPrintCount);
    const printWindow = window.open("", "_blank", "width=1200,height=900");
    if (!printWindow) {
      setAuthError("Tulostusikkunan avaaminen estettiin selaimessa.");
      return;
    }

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const blobUrl = window.URL.createObjectURL(blob);
    let cleanedUp = false;

    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      window.setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
      }, 2000);
    };

    printWindow.onload = () => {
      window.setTimeout(() => {
        try {
          printWindow.focus();
          printWindow.print();
        } catch (error) {
          console.error("Etikettien tulostus epäonnistui:", error);
        } finally {
          cleanup();
        }
      }, mode === "pdf" ? 450 : 300);
    };

    try {
      printWindow.location.replace(blobUrl);
    } catch (error) {
      cleanup();
      console.error("Etikettinäkymän avaaminen epäonnistui:", error);
      setAuthError("Etikettinäkymän avaaminen epäonnistui.");
    }
  };

  if (publicBatchId) {
    return <PublicBatchView batchId={publicBatchId} data={publicBatchData} loading={publicBatchLoading} error={publicBatchError} />;
  }

  if (loading) {
    return <div style={styles.app}><div style={styles.container}><div style={{ ...styles.card, ...styles.sectionCard }}>Ladataan...</div></div></div>;
  }

  if (authMode === "recovery" || !session || !profile) {
    return <AuthView authMode={authMode} setAuthMode={setAuthMode} authForm={authForm} setAuthForm={setAuthForm} onSignIn={handleSignIn} onSignUp={handleSignUp} onForgotPassword={handleForgotPassword} onResetRecoveredPassword={handleResetRecoveredPassword} authError={authError} authInfo={authInfo} />;
  }

  if (!profile.is_active && availableRoleOptions.length === 0) {
    return <PendingApprovalView profile={profile} onLogout={handleLogout} />;
  }

  if (roleSelectionOpen && availableRoleOptions.length > 1) {
    return <RoleSelectionView roleOptions={availableRoleOptions} buyers={buyers} onSelectRole={handleRoleSelect} />;
  }

  if (profile.role === "buyer") {
    const formatOfferDate = (value) => {
      if (!value) return "-";
      try {
        return new Date(value).toLocaleString("fi-FI", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
      } catch {
        return String(value || "-");
      }
    };

    const formatOfferDay = (value) => {
      if (!value) return "Ei päivämäärää";
      try {
        return new Date(value).toLocaleDateString("fi-FI", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });
      } catch {
        return String(value || "Ei päivämäärää");
      }
    };

    const buildOfferHeadline = (offer) => {
      if (isMixedOffer(offer)) return "Monilajinen erä";
      return getOfferSpeciesHeadline(offer?.species_summary);
    };

    const getVisibleOfferPrice = (offer) => {
      if (offer?.counter_price_per_kg !== "" && offer?.counter_price_per_kg != null) return offer.counter_price_per_kg;
      if (offer?.price_per_kg !== "" && offer?.price_per_kg != null) return offer.price_per_kg;
      if (offer?.price_per_kg_fallback !== "" && offer?.price_per_kg_fallback != null) return offer.price_per_kg_fallback;
      const parsedFromNotes = parsePricePerKgFromNotes(offer?.notes);
      if (parsedFromNotes !== "" && parsedFromNotes != null) return parsedFromNotes;
      return "";
    };

    const filteredBuyerOffers = (buyerOffers || []).filter((offer) => {
      const q = buyerOffersSearch.trim().toLowerCase();
      const statusOk = buyerOffersFilter === "all"
        ? true
        : buyerOffersFilter === "open"
        ? ["sent", "viewed", "countered", "reserved", "sold"].includes(offer.status)
        : buyerOffersFilter === "accepted"
        ? ["accepted", "sold"].includes(offer.status)
        : offer.status === buyerOffersFilter;
      const text = [offer.seller_name, offer.area, offer.spot, offer.species_summary, offer.status, offer.buyer_message]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return statusOk && (!q || text.includes(q));
    });

    const groupedByDay = filteredBuyerOffers.reduce((acc, offer) => {
      const key = formatOfferDay(offer.updated_at || offer.created_at);
      if (!acc[key]) acc[key] = [];
      acc[key].push(offer);
      return acc;
    }, {});

    const orderedGroups = Object.entries(groupedByDay).sort((a, b) => {
      const aTime = new Date((a[1]?.[0]?.updated_at || a[1]?.[0]?.created_at || 0)).getTime();
      const bTime = new Date((b[1]?.[0]?.updated_at || b[1]?.[0]?.created_at || 0)).getTime();
      return bTime - aTime;
    });
    const todayLabel = formatOfferDay(new Date().toISOString());
    const acceptedBuyerOffers = (buyerOffers || []).filter(
      (offer) => offer.status === "accepted" && formatOfferDay(offer.updated_at || offer.created_at) === todayLabel
    );

    return (
      <div style={styles.app}>
        <div style={styles.container}>
          <div style={{ ...styles.card, ...styles.headerCard }}>
            <div style={styles.rowBetween}>
              <div>
                <h1 style={styles.title}>Suoraan Kalastajalta</h1>
                <p style={styles.subtitle}>Ostaja: <strong>{profile.display_name}</strong></p>
              </div>
              <div style={styles.toolbar}>
                <button style={styles.button} onClick={() => setRefreshTick((prev) => prev + 1)}>Päivitä</button>
                <button style={styles.button} onClick={() => setAccountPanelOpen((prev) => !prev)}>{accountPanelOpen ? "Sulje omat tiedot" : "Omat tiedot"}</button>
                <button style={styles.button} onClick={handleLogout}>Kirjaudu ulos</button>
              </div>
            </div>
          </div>

          {accountPanelOpen ? (
            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack, marginBottom: 16 }}>
              <div style={styles.rowBetween}>
                <div>
                  <strong>Omat tiedot</strong>
                  <div style={styles.muted}>Päivitä käyttäjänimi, yrityksen tiedot ja salasana.</div>
                </div>
                <span style={styles.badge}>{profile.email}</span>
              </div>
              <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack, background: "#f8fafc" }}>
                <strong>Profiili</strong>
                <div style={styles.field}>
                  <label>Käyttäjän nimi</label>
                  <input style={styles.input} value={accountForm.displayName} onChange={(e) => setAccountForm((prev) => ({ ...prev, displayName: e.target.value }))} placeholder="Nimi" />
                </div>
                <div style={styles.field}>
                  <label>Kirjautumissähköposti</label>
                  <input style={styles.input} value={profile.email || ""} disabled />
                </div>
                {linkedBuyerRecord ? (
                  <>
                    <div style={styles.field}>
                      <label>Yritys</label>
                      <input style={styles.input} value={accountForm.companyName} onChange={(e) => setAccountForm((prev) => ({ ...prev, companyName: e.target.value }))} placeholder="Yrityksen nimi" />
                    </div>
                    <div style={styles.field}>
                      <label>Yhteyshenkilö</label>
                      <input style={styles.input} value={accountForm.contactName} onChange={(e) => setAccountForm((prev) => ({ ...prev, contactName: e.target.value }))} placeholder="Yhteyshenkilö" />
                    </div>
                    <div style={styles.field}>
                      <label>Puhelin</label>
                      <input style={styles.input} value={accountForm.phone} onChange={(e) => setAccountForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="Puhelin" />
                    </div>
                    <div style={styles.field}>
                      <label>Paikkakunta</label>
                      <MunicipalitySelect value={accountForm.city} onChange={(e) => setAccountForm((prev) => ({ ...prev, city: e.target.value }))} />
                    </div>
                    <div style={styles.field}>
                      <label>Toimitusosoite</label>
                      <input style={styles.input} value={accountForm.deliveryAddress} onChange={(e) => setAccountForm((prev) => ({ ...prev, deliveryAddress: e.target.value, ...(accountBillingSameAsDelivery ? { billingAddress: e.target.value } : {}) }))} placeholder="Katuosoite" />
                    </div>
                    <div style={styles.field}>
                      <label>Toimitus postinumero</label>
                      <input style={styles.input} value={accountForm.deliveryPostcode} onChange={(e) => setAccountForm((prev) => ({ ...prev, deliveryPostcode: e.target.value, ...(accountBillingSameAsDelivery ? { billingPostcode: e.target.value } : {}) }))} placeholder="00100" />
                    </div>
                    <div style={styles.field}>
                      <label>Toimitus kaupunki</label>
                      <MunicipalitySelect value={accountForm.deliveryCity} onChange={(e) => setAccountForm((prev) => ({ ...prev, deliveryCity: e.target.value, ...(accountBillingSameAsDelivery ? { billingCity: e.target.value } : {}) }))} />
                    </div>
                    <div style={{ ...styles.field, ...styles.fieldFull }}>
                      <label><input type="checkbox" checked={accountBillingSameAsDelivery} onChange={(e) => {
                        const checked = e.target.checked;
                        setAccountBillingSameAsDelivery(checked);
                        if (checked) applyAccountDeliveryToBilling();
                      }} /> Laskutustiedot samat kuin toimitustiedot</label>
                    </div>
                    <div style={styles.field}>
                      <label>Laskutusosoite</label>
                      <input style={styles.input} value={accountForm.billingAddress} onChange={(e) => setAccountForm((prev) => ({ ...prev, billingAddress: e.target.value }))} placeholder="Katuosoite" />
                    </div>
                    <div style={styles.field}>
                      <label>Laskutus postinumero</label>
                      <input style={styles.input} value={accountForm.billingPostcode} onChange={(e) => setAccountForm((prev) => ({ ...prev, billingPostcode: e.target.value }))} placeholder="00100" />
                    </div>
                    <div style={styles.field}>
                      <label>Laskutus kaupunki</label>
                      <MunicipalitySelect value={accountForm.billingCity} onChange={(e) => setAccountForm((prev) => ({ ...prev, billingCity: e.target.value }))} />
                    </div>
                    <div style={styles.field}>
                      <label>Laskutussähköposti</label>
                      <input style={styles.input} type="email" value={accountForm.billingEmail} onChange={(e) => setAccountForm((prev) => ({ ...prev, billingEmail: e.target.value }))} placeholder="laskutus@yritys.fi" />
                    </div>
                    <div style={styles.field}>
                      <label>Y-tunnus</label>
                      <input style={styles.input} value={accountForm.businessId} onChange={(e) => setAccountForm((prev) => ({ ...prev, businessId: e.target.value }))} placeholder="1234567-8" />
                    </div>
                    <div style={styles.field}>
                      <label>Lisätiedot</label>
                      <textarea style={styles.textarea} value={accountForm.notes} onChange={(e) => setAccountForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Toimitusohjeet, huomioita" />
                    </div>
                  </>
                ) : (
                  <div style={styles.noticeInfo}>Tälle ostajakäyttäjälle ei löytynyt linkitettyä ostajarekisterin yritystä. Nimi ja salasana voidaan silti päivittää.</div>
                )}
                <div style={{ ...styles.row, justifyContent: "flex-end" }}>
                  <button style={{ ...styles.button, ...styles.primaryButton }} onClick={handleSaveOwnDetails} disabled={accountSaving}>{accountSaving ? "Tallennetaan..." : "Tallenna tiedot"}</button>
                </div>
              </div>
              <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack, background: "#f8fafc" }}>
                <strong>Vaihda salasana</strong>
                <div style={styles.field}>
                  <label>Uusi salasana</label>
                  <input style={styles.input} type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))} placeholder="Vähintään 8 merkkiä" />
                </div>
                <div style={styles.field}>
                  <label>Uusi salasana uudelleen</label>
                  <input style={styles.input} type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))} placeholder="Kirjoita salasana uudelleen" />
                </div>
                <div style={styles.muted}>Salasanan vaihto tehdään heti nykyiselle käyttäjätilille.</div>
                <div style={{ ...styles.row, justifyContent: "flex-end" }}>
                  <button style={{ ...styles.button, ...styles.primaryButton }} onClick={handleChangePassword} disabled={passwordSaving}>{passwordSaving ? "Vaihdetaan..." : "Vaihda salasana"}</button>
                </div>
              </div>
            </div>
          ) : null}

          {authError ? <div style={{ ...styles.noticeError, marginBottom: 16 }}>{authError}</div> : null}
          {authInfo ? <div style={{ ...styles.noticeSuccess, marginBottom: 16 }}>{authInfo}</div> : null}
          {acceptedBuyerOffers.length > 0 ? (
            <div style={{ ...styles.successHighlightBox, ...styles.stack, marginBottom: 16 }}>
              <div style={styles.rowBetween}>
                <div>
                  <strong>Kauppa hyväksytty</strong>
                  <div style={styles.muted}>
                    {acceptedBuyerOffers.length === 1
                      ? "Sinulla on 1 hyväksytty kauppa. Tarkemmat tiedot löytyvät alempaa tarjouslistan vetolaatikosta."
                      : `Sinulla on ${acceptedBuyerOffers.length} hyväksyttyä kauppaa. Tarkemmat tiedot löytyvät alempaa tarjouslistan vetolaatikosta.`}
                  </div>
                </div>
                <button
                  style={{ ...styles.button, background: "#166534", borderColor: "#166534", color: "#fff" }}
                  onClick={() => setBuyerOffersFilter("accepted")}
                >
                  Näytä hyväksytyt
                </button>
              </div>
            </div>
          ) : null}

          <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
            <div style={styles.rowBetween}>
              <strong>Minulle tarjotut erät</strong>
              <div style={styles.row}>
                <select style={styles.input} value={buyerOffersFilter} onChange={(e) => setBuyerOffersFilter(e.target.value)}>
                  <option value="open">Avoimet</option>
                  <option value="reserved">Varatut</option>
                  <option value="accepted">Hyväksytyt / myydyt</option>
                  <option value="countered">Vastatarjoukset</option>
                  <option value="rejected">Hylätyt</option>
                  <option value="all">Kaikki</option>
                </select>
                <input
                  style={{ ...styles.input, width: 320 }}
                  placeholder="Hae myyjällä, alueella, lajilla..."
                  value={buyerOffersSearch}
                  onChange={(e) => setBuyerOffersSearch(e.target.value)}
                />
              </div>
            </div>

            {filteredBuyerOffers.length === 0 ? (
              <div style={styles.muted}>Ei tarjottuja eriä.</div>
            ) : (
              orderedGroups.map(([dayLabel, offersForDay]) => (
                <div key={dayLabel} style={styles.stack}>
                  <div style={{ ...styles.card, ...styles.sectionCard, padding: "12px 16px", background: "#eff6ff", borderColor: "#bfdbfe" }}>
                    <strong style={{ fontSize: 18 }}>{dayLabel}</strong>
                  </div>

                  {offersForDay.map((o) => {
                    const isActive = buyerActiveOfferId === o.id;
                    const visiblePrice = getVisibleOfferPrice(o);
                    const sellerInfo = getBuyerVisibleSellerInfo(o);
                    const mixedOffer = isMixedOffer(o);
                    const visibleAdditionalNotes = extractVisibleAdditionalNotes(o.notes);
                    const ownDeliveryPrice = o.route_price_eur !== "" && o.route_price_eur != null ? Number(o.route_price_eur) : null;
                    const ownTotalPrice = o.total_price_eur !== "" && o.total_price_eur != null ? Number(o.total_price_eur) : null;
                    const ownDeliveredPricePerKg = o.delivered_price_per_kg !== "" && o.delivered_price_per_kg != null ? Number(o.delivered_price_per_kg) : null;
                    return (
                      <div key={o.id} style={{ ...styles.entry, borderLeft: "5px solid #0f172a" }}>
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 6 }}>{formatOfferDate(o.updated_at || o.created_at)}</div>
                          <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.15, marginBottom: 8 }}>{buildOfferHeadline(o)}</div>
                          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
                            {mixedOffer ? (
                              <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a" }}>
                                {getOfferSummaryLines(o.species_summary).length} lajia samassa erässä
                              </div>
                            ) : (
                              <div style={{ fontSize: 24, fontWeight: 700, color: "#0f172a" }}>
                                {getOfferQuantityDisplay(o)}
                              </div>
                            )}
                            {!mixedOffer && visiblePrice !== "" && visiblePrice != null ? (
                              <div style={{ fontSize: 24, fontWeight: 700, color: "#0f172a" }}>
                                {euro(visiblePrice)} / {getOfferDisplayUnit(o)}
                              </div>
                            ) : null}
                          </div>
                          {o.batch_id && !mixedOffer ? <div style={{ ...styles.muted, marginBottom: 8 }}><strong>Erätunnus:</strong> {o.batch_id}</div> : null}
                          {o.batch_id && !mixedOffer ? <div style={{ ...styles.qrBlock, marginBottom: 8 }}><img src={getBatchQrImageUrl(o.batch_id)} alt={`QR ${o.batch_id}`} style={styles.qrImage} /><div style={styles.small}>QR-koodi erälle</div></div> : null}
                          <div style={styles.entryBadges}>
                            <span style={styles.badge}>{buyerStatusLabel(o.status)}</span>
                            <span style={styles.badge}>{o.area || "-"}</span>
                            {o.status === "reserved" ? <span style={{ ...styles.badge, background: "#fff7ed", borderColor: "#fdba74" }}>Varaus käynnissä</span> : null}
                            {o.status === "sold" ? <span style={{ ...styles.badge, background: "#fee2e2", borderColor: "#fca5a5", color: "#b91c1c" }}>MYYTY</span> : null}
                            <span style={styles.badge}>Tarjoaja: {sellerInfo.sellerLabel}</span>
                          </div>
                        </div>

                        <div style={{ ...styles.grid2, marginBottom: 10 }}>
                          <div>
                            <div style={styles.muted}><strong>Erän tiedot</strong></div>
                            {mixedOffer ? <div style={{ ...styles.noticeInfo, marginBottom: 8 }}>Tämä monilajinen erä myydään kokonaisuutena. Kalalajit, hinnat ja erätunnukset näkyvät alla riveittäin.</div> : null}
                            <div style={{ ...styles.muted, whiteSpace: "pre-wrap" }}>{formatSpeciesSummaryText(o.species_summary) || "-"}</div>
                            {!mixedOffer ? <div style={styles.muted}>Määrä: {getOfferQuantityDisplay(o)}</div> : null}
                            {!mixedOffer && visiblePrice !== "" && visiblePrice != null ? <div style={styles.muted}>Hinta: {euro(visiblePrice)} / {getOfferDisplayUnit(o)}</div> : null}
                            {ownDeliveryPrice != null ? <div style={styles.muted}>Toimitushinta omaan kaupunkiin ({o.delivery_destination_city || linkedBuyerRecord?.city || "-" }): {formatDeliveryPrice(ownDeliveryPrice)}</div> : null}
                            {ownTotalPrice != null ? <div style={styles.muted}>Kokonaishinta: {formatDeliveryPrice(ownTotalPrice)}</div> : null}
                            {ownDeliveredPricePerKg != null ? <div style={styles.muted}>Toimitettuna: {formatDeliveredPricePerKg(ownDeliveredPricePerKg)}</div> : null}
                            <div style={styles.muted}>Tarjoaja: {sellerInfo.sellerLabel}</div>
                            {sellerInfo.sellerCommercialFishingId && sellerInfo.revealIdentity ? <div style={styles.muted}>Kaupallisen kalastajan tunnus: {sellerInfo.sellerCommercialFishingId}</div> : null}
                            <div style={styles.muted}>
                              {sellerInfo.deliveryMethod === "Nouto" ? "Noutopaikka" : "Toimitusalue"}: {sellerInfo.revealIdentity ? sellerInfo.exactLocation : sellerInfo.publicLocation}
                            </div>
                            {sellerInfo.publicSpot ? <div style={styles.muted}>Paikka: {sellerInfo.publicSpot}</div> : null}
                          </div>
                          <div>
                            <div style={styles.muted}><strong>Toimitus ja lisätiedot</strong></div>
                            <div style={styles.muted}>Toimitustapa: {sellerInfo.deliveryMethod || "-"}</div>
                            <div style={styles.muted}>Kulu: {ownDeliveryPrice != null ? formatDeliveryPrice(ownDeliveryPrice) : (sellerInfo.deliveryCost !== "" && sellerInfo.deliveryCost != null ? `${sellerInfo.deliveryCost} €` : "-")}</div>
                            <div style={styles.muted}>Aikaisin toimitus: {sellerInfo.earliestDeliveryDate || "-"}</div>
                            <div style={styles.muted}>Kylmäkuljetus: {sellerInfo.coldTransport ? "kyllä" : "ei"}</div>
                            {visibleAdditionalNotes ? <div style={{ ...styles.muted, whiteSpace: "pre-wrap" }}>{visibleAdditionalNotes}</div> : <div style={styles.muted}>Ei lisätietoja</div>}
                          </div>
                        </div>

                        {o.buyer_message ? <div style={styles.muted}>Sinun viesti: {o.buyer_message}</div> : null}
                        {o.status === "accepted" ? (
                          <div style={{ ...styles.noticeSuccess, marginTop: 10 }}>
                            Kauppa hyväksytty. Myyjä hyväksyi tarjouksesi.
                          </div>
                        ) : null}
                        {o.status === "sold" ? (
                          <div style={{ ...styles.noticeError, marginTop: 10 }}>
                            MYYTY. Tämä erä on myyty toiselle ostajalle, eikä sitä voi enää varata.
                          </div>
                        ) : null}

                        <div style={{ ...styles.row, marginTop: 12 }}>
                          <button style={styles.button} onClick={() => {
                            if (o.status === "sent") {
                              buyerUpdateOffer(o.id, { status: "viewed" });
                            }
                            setBuyerActiveOfferId(isActive ? null : o.id);
                          }}>{isActive ? "Sulje" : o.status === "accepted" || o.status === "sold" ? "Näytä tiedot" : o.status === "reserved" ? "Muokkaa varausta" : "Tee vastatarjous / varaa"}</button>
                          {o.status !== "accepted" && o.status !== "sold" ? <button style={styles.button} onClick={() => onRejectBuyerOffer(o)}>Hylkää</button> : null}
                        </div>

                        {isActive ? (
                          <div style={{ ...styles.stack, marginTop: 12 }}>
                            {o.status === "accepted" ? (
                          <div style={styles.noticeSuccess}>
                            Kauppa on hyväksytty. Kalastajan täydet tiedot ja lopullinen nouto- tai toimitusosoite näkyvät nyt alla.
                          </div>
                        ) : null}
                        {o.status === "sold" ? (
                          <div style={styles.noticeError}>Erä on myyty toiselle ostajalle. Varaus- ja vastatarjoustoiminnot eivät ole enää käytettävissä.</div>
                        ) : null}
                        {o.status === "accepted" ? (
                          <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack, background: "#f8fafc" }}>
                            <strong>Kalastajan tiedot</strong>
                            <div style={styles.muted}>Nimi: {sellerInfo.sellerName || "-"}</div>
                            {o.sellerEmail ? <div style={styles.muted}>Sähköposti: {o.sellerEmail}</div> : null}
                            {sellerInfo.sellerCommercialFishingId ? <div style={styles.muted}>Kaupallisen kalastajan tunnus: {sellerInfo.sellerCommercialFishingId}</div> : null}
                            <div style={styles.muted}>Vesialue: {sellerInfo.sellerArea || "-"}</div>
                            {sellerInfo.sellerSpot ? <div style={styles.muted}>Pyyntipaikka: {sellerInfo.sellerSpot}</div> : null}
                            <div style={styles.muted}>
                              {sellerInfo.deliveryMethod === "Nouto" ? "Nouto-osoite" : "Toimitusalue"}: {sellerInfo.exactLocation}
                            </div>
                            <div style={styles.muted}>Toimitustapa: {sellerInfo.deliveryMethod || "-"}</div>
                            <div style={styles.muted}>Toimituskulu: {sellerInfo.deliveryCost !== "" && sellerInfo.deliveryCost != null ? `${sellerInfo.deliveryCost} €` : "-"}</div>
                            <div style={styles.muted}>Aikaisin toimitus: {sellerInfo.earliestDeliveryDate || "-"}</div>
                            <div style={styles.muted}>Kylmäkuljetus: {sellerInfo.coldTransport ? "kyllä" : "ei"}</div>
                            <div style={styles.muted}>Toimituksen tila: {fulfillmentStatusLabel(o.fulfillment_status)}</div>
                            <div style={styles.row}>
                              {o.fulfillment_status !== "delivery_agreed" ? <button style={styles.button} onClick={() => updateFulfillmentStatus(o, "delivery_agreed")}>Merkitse toimitus sovituksi</button> : null}
                              {o.fulfillment_status !== "delivered" ? <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => updateFulfillmentStatus(o, "delivered")}>Merkitse toimitetuksi</button> : null}
                            </div>
                          </div>
                        ) : null}
                        {o.status === "sold" ? null : (
                        <>
                        {!mixedOffer ? (
                          <div style={styles.field}>
                            <label>Vastatarjous €/kg</label>
                                <input style={styles.input} type="number" value={buyerAction.counter_price_per_kg} onChange={(e) => setBuyerAction((p) => ({ ...p, counter_price_per_kg: e.target.value }))} placeholder="Esim. 5.80" />
                              </div>
                        ) : null}
                            {mixedOffer ? (
                              <div style={styles.noticeInfo}>Monilajinen erä varataan aina kokonaisuutena. Yksittäisiä kalalajeja ei voi varata erikseen tästä tarjouksesta.</div>
                            ) : (
                              <div style={styles.field}>
                                <label>Varaa kg (tyhjä = koko erä)</label>
                                <input style={styles.input} type="number" value={buyerAction.reserved_kilos} onChange={(e) => setBuyerAction((p) => ({ ...p, reserved_kilos: e.target.value }))} placeholder={`Max ${o.total_kilos}`} />
                              </div>
                            )}
                            <div style={styles.field}>
                              <label>Viesti myyjälle</label>
                              <textarea style={styles.textarea} value={buyerAction.buyer_message} onChange={(e) => setBuyerAction((p) => ({ ...p, buyer_message: e.target.value }))} placeholder="Toimitus, nouto, aikataulu..." />
                            </div>
                            <div style={styles.row}>
                              {!mixedOffer ? <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => onSubmitCounter(o)}>Lähetä vastatarjous</button> : null}
                              <button style={styles.button} onClick={() => onReserve(o)}>{o.status === "reserved" ? "Päivitä varaus" : "Varaa erä"}</button>
                            </div>
                            </>
                        )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  const tabStyle = profile.role === "owner"
    ? { ...styles.tabs, gridTemplateColumns: "repeat(8, minmax(0, 1fr))" }
    : styles.tabs6;
  const grid3 = responsiveGridStyle(styles.grid3);
  const grid2 = responsiveGridStyle(styles.grid2);
  const formGrid = responsiveGridStyle(styles.formGrid);
  const speciesRow = responsiveGridStyle(styles.speciesRow);
  const logoHeight = typeof window !== "undefined" && window.innerWidth < 768
    ? 128
    : typeof window !== "undefined" && window.innerWidth < 1024
    ? 156
    : 172;

  return (
    <div style={styles.app}>
      <div style={styles.container}>
        <div style={{ ...styles.card, ...styles.headerCard }}>
          <div style={styles.rowBetween}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "nowrap", marginTop: 12, marginBottom: 12 }}>
                <h1 style={{ ...styles.title, marginRight: -2 }}>Suoraan Kalastajalta</h1>
                <img
                  src="/logo.png"
                  alt=""
                  style={{
                    height: logoHeight,
                    width: "auto",
                    maxWidth: typeof window !== "undefined" && window.innerWidth < 768 ? "32vw" : "none",
                    objectFit: "contain",
                    display: "block",
                    flexShrink: 0,
                  }}
                />
              </div>
              <p style={styles.subtitle}>Kirjautunut: <strong>{profile.display_name}</strong> · rooli: {profile.role === "owner" ? "omistaja" : profile.role === "buyer" ? "ostaja" : profile.role === "processor" ? "jalostaja" : "kalastaja"}</p>
              {profile.role === "processor" ? (
                <p style={{ ...styles.subtitle, marginTop: 4 }}>
                  Vesiviljelylaitoksen laitosnumero: <strong>{profile.evira_facility_id || "ei asetettu"}</strong>
                </p>
              ) : profile.role !== "buyer" ? (
                <p style={{ ...styles.subtitle, marginTop: 4 }}>
                  Kaupallisen kalastusaluksen tunnukset: <strong>{getCommercialFishingVesselIds(profile).join(", ") || profile.commercial_fishing_vessel_id || "ei asetettu"}</strong>
                  {profile.commercial_fishing_id ? ` · Kalastajan tunnus: ${profile.commercial_fishing_id}` : ""}
                </p>
              ) : null}
            </div>
            <div style={styles.toolbar}>
              {availableRoleOptions.length > 1 ? (
                <select
                  style={styles.input}
                  value={activeRoleOption?.id || ""}
                  onChange={(e) => {
                    const selectedRole = availableRoleOptions.find((option) => String(option.id) === String(e.target.value));
                    if (selectedRole) {
                      handleRoleSelect(selectedRole);
                    }
                  }}
                >
                  {availableRoleOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {buildRoleOptionLabel(option, buyers)}
                    </option>
                  ))}
                </select>
              ) : null}
              {profile.role === "owner" ? (
                <select style={styles.input} value={entryScope} onChange={(e) => setEntryScope(e.target.value)}>
                  <option value="own">Näytä vain omat</option>
                  <option value="all">Näytä kaikkien saaliit</option>
                </select>
              ) : null}
              <span style={styles.badge}>{profile.role === "processor" ? `${totals.totalProcessedKg.toFixed(1)} kg jalosteita` : `${totals.totalKg.toFixed(1)} kg yhteensä`}</span>
              <button style={styles.button} onClick={() => setRefreshTick((prev) => prev + 1)}>Päivitä</button>
              <button style={styles.button} onClick={() => setAccountPanelOpen((prev) => !prev)}>{accountPanelOpen ? "Sulje omat tiedot" : "Omat tiedot"}</button>
              <button style={styles.button} onClick={handleLogout}>Kirjaudu ulos</button>
            </div>
          </div>
        </div>

        {accountPanelOpen ? (
          <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack, marginBottom: 16 }}>
            <div style={styles.rowBetween}>
              <div>
                <strong>Omat tiedot</strong>
                <div style={styles.muted}>
                  {profile.role === "processor"
                    ? "Päivitä oma nimi, vesiviljelylaitoksen laitosnumero ja salasana."
                    : "Päivitä oma nimi, aluksen tunnus, kalastajatunnus ja salasana."}
                </div>
              </div>
              <span style={styles.badge}>{profile.email}</span>
            </div>
            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack, background: "#f8fafc" }}>
              <strong>Profiili</strong>
              <div style={styles.field}>
                <label>Nimi</label>
                <input style={styles.input} value={accountForm.displayName} onChange={(e) => setAccountForm((prev) => ({ ...prev, displayName: e.target.value }))} placeholder="Nimi" />
              </div>
              <div style={styles.field}>
                <label>Kirjautumissähköposti</label>
                <input style={styles.input} value={profile.email || ""} disabled />
              </div>
              {profile.role === "processor" ? (
                <>
                  <div style={styles.field}>
                    <label>Laitosnumero</label>
                    <input style={styles.input} value={accountForm.eviraFacilityId} onChange={(e) => setAccountForm((prev) => ({ ...prev, eviraFacilityId: e.target.value }))} placeholder="Esim. F12345" />
                  </div>
                  <div style={styles.field}>
                    <label>Yrityksen nimi</label>
                    <input style={styles.input} value={accountForm.companyName} onChange={(e) => setAccountForm((prev) => ({ ...prev, companyName: e.target.value }))} placeholder="Yrityksen nimi" />
                  </div>
                  <div style={styles.field}>
                    <label>Y-tunnus</label>
                    <input style={styles.input} value={accountForm.businessId} onChange={(e) => setAccountForm((prev) => ({ ...prev, businessId: e.target.value }))} placeholder="1234567-8" />
                  </div>
                  <div style={styles.field}>
                    <label>Osoite</label>
                    <input style={styles.input} value={accountForm.address} onChange={(e) => setAccountForm((prev) => ({ ...prev, address: e.target.value, ...(accountBillingSameAsDelivery ? { billingAddress: e.target.value } : {}) }))} placeholder="Katuosoite" />
                  </div>
                  <div style={styles.field}>
                    <label>Postinumero</label>
                    <input style={styles.input} value={accountForm.postcode} onChange={(e) => setAccountForm((prev) => ({ ...prev, postcode: e.target.value, ...(accountBillingSameAsDelivery ? { billingPostcode: e.target.value } : {}) }))} placeholder="00100" />
                  </div>
                  <div style={styles.field}>
                    <label>Paikkakunta</label>
                    <MunicipalitySelect value={accountForm.city} onChange={(e) => setAccountForm((prev) => ({ ...prev, city: e.target.value, ...(accountBillingSameAsDelivery ? { billingCity: e.target.value } : {}) }))} />
                  </div>
                  <div style={{ ...styles.field, ...styles.fieldFull }}>
                    <label><input type="checkbox" checked={accountBillingSameAsDelivery} onChange={(e) => {
                      const checked = e.target.checked;
                      setAccountBillingSameAsDelivery(checked);
                      if (checked) applyAccountAddressToBilling();
                    }} /> Laskutusosoite sama kuin osoite</label>
                  </div>
                  <div style={styles.field}>
                    <label>Laskutusosoite</label>
                    <input style={styles.input} value={accountForm.billingAddress} onChange={(e) => setAccountForm((prev) => ({ ...prev, billingAddress: e.target.value }))} placeholder="Katuosoite" />
                  </div>
                  <div style={styles.field}>
                    <label>Laskutus postinumero</label>
                    <input style={styles.input} value={accountForm.billingPostcode} onChange={(e) => setAccountForm((prev) => ({ ...prev, billingPostcode: e.target.value }))} placeholder="00100" />
                  </div>
                  <div style={styles.field}>
                    <label>Laskutus paikkakunta</label>
                    <MunicipalitySelect value={accountForm.billingCity} onChange={(e) => setAccountForm((prev) => ({ ...prev, billingCity: e.target.value }))} />
                  </div>
                  <div style={styles.field}>
                    <label>Laskutussähköposti</label>
                    <input style={styles.input} type="email" value={accountForm.billingEmail} onChange={(e) => setAccountForm((prev) => ({ ...prev, billingEmail: e.target.value }))} placeholder="laskutus@yritys.fi" />
                  </div>
                  <div style={styles.field}>
                    <label>Verkkolaskuosoite</label>
                    <input style={styles.input} value={accountForm.einvoiceAddress} onChange={(e) => setAccountForm((prev) => ({ ...prev, einvoiceAddress: e.target.value }))} placeholder="Verkkolaskuosoite" />
                  </div>
                  <div style={styles.field}>
                    <label>Sähköposti</label>
                    <input style={styles.input} type="email" value={accountForm.contactEmail} onChange={(e) => setAccountForm((prev) => ({ ...prev, contactEmail: e.target.value }))} placeholder="yritys@yritys.fi" />
                  </div>
                  <div style={styles.field}>
                    <label>Puhelinnumero</label>
                    <input style={styles.input} value={accountForm.phone} onChange={(e) => setAccountForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="Puhelinnumero" />
                  </div>
                </>
              ) : (
                <>
                  <div style={styles.field}>
                    <label>Kaupallisen kalastusaluksen tunnukset</label>
                    <textarea
                      style={styles.textarea}
                      value={accountForm.commercialFishingVesselIdsText}
                      onChange={(e) => setAccountForm((prev) => ({ ...prev, commercialFishingVesselIdsText: e.target.value }))}
                      placeholder={"Yksi tunnus per rivi\nEsim. FIN1234A"}
                    />
                    <div style={styles.small}>Ensimmäinen tunnus toimii oletuksena, mutta saalista syöttäessä voit valita käytetyn aluksen erikseen.</div>
                  </div>
                  <div style={styles.field}>
                    <label>Kaupallisen kalastajan tunnus</label>
                    <input style={styles.input} value={accountForm.commercialFishingId} onChange={(e) => setAccountForm((prev) => ({ ...prev, commercialFishingId: e.target.value }))} placeholder="Esim. 123456" />
                  </div>
                  <div style={styles.field}>
                    <label>Nouto-osoite</label>
                    <input style={styles.input} value={accountForm.pickupAddress} onChange={(e) => setAccountForm((prev) => ({ ...prev, pickupAddress: e.target.value }))} placeholder="Katuosoite noutoa varten" />
                  </div>
                  <div style={styles.field}>
                    <label>Yrityksen nimi</label>
                    <input style={styles.input} value={accountForm.companyName} onChange={(e) => setAccountForm((prev) => ({ ...prev, companyName: e.target.value }))} placeholder="Yrityksen nimi" />
                  </div>
                  <div style={styles.field}>
                    <label>Y-tunnus</label>
                    <input style={styles.input} value={accountForm.businessId} onChange={(e) => setAccountForm((prev) => ({ ...prev, businessId: e.target.value }))} placeholder="1234567-8" />
                  </div>
                  <div style={styles.field}>
                    <label>Osoite</label>
                    <input style={styles.input} value={accountForm.address} onChange={(e) => setAccountForm((prev) => ({ ...prev, address: e.target.value, ...(accountBillingSameAsDelivery ? { billingAddress: e.target.value } : {}) }))} placeholder="Katuosoite" />
                  </div>
                  <div style={styles.field}>
                    <label>Postinumero</label>
                    <input style={styles.input} value={accountForm.postcode} onChange={(e) => setAccountForm((prev) => ({ ...prev, postcode: e.target.value, ...(accountBillingSameAsDelivery ? { billingPostcode: e.target.value } : {}) }))} placeholder="00100" />
                  </div>
                  <div style={styles.field}>
                    <label>Paikkakunta</label>
                    <MunicipalitySelect value={accountForm.city} onChange={(e) => setAccountForm((prev) => ({ ...prev, city: e.target.value, ...(accountBillingSameAsDelivery ? { billingCity: e.target.value } : {}) }))} />
                  </div>
                  <div style={{ ...styles.field, ...styles.fieldFull }}>
                    <label><input type="checkbox" checked={accountBillingSameAsDelivery} onChange={(e) => {
                      const checked = e.target.checked;
                      setAccountBillingSameAsDelivery(checked);
                      if (checked) applyAccountAddressToBilling();
                    }} /> Laskutusosoite sama kuin osoite</label>
                  </div>
                  <div style={styles.field}>
                    <label>Laskutusosoite</label>
                    <input style={styles.input} value={accountForm.billingAddress} onChange={(e) => setAccountForm((prev) => ({ ...prev, billingAddress: e.target.value }))} placeholder="Katuosoite" />
                  </div>
                  <div style={styles.field}>
                    <label>Laskutus postinumero</label>
                    <input style={styles.input} value={accountForm.billingPostcode} onChange={(e) => setAccountForm((prev) => ({ ...prev, billingPostcode: e.target.value }))} placeholder="00100" />
                  </div>
                  <div style={styles.field}>
                    <label>Laskutus paikkakunta</label>
                    <MunicipalitySelect value={accountForm.billingCity} onChange={(e) => setAccountForm((prev) => ({ ...prev, billingCity: e.target.value }))} />
                  </div>
                  <div style={styles.field}>
                    <label>Laskutussähköposti</label>
                    <input style={styles.input} type="email" value={accountForm.billingEmail} onChange={(e) => setAccountForm((prev) => ({ ...prev, billingEmail: e.target.value }))} placeholder="laskutus@yritys.fi" />
                  </div>
                  <div style={styles.field}>
                    <label>Verkkolaskuosoite</label>
                    <input style={styles.input} value={accountForm.einvoiceAddress} onChange={(e) => setAccountForm((prev) => ({ ...prev, einvoiceAddress: e.target.value }))} placeholder="Verkkolaskuosoite" />
                  </div>
                  <div style={styles.field}>
                    <label>Sähköposti</label>
                    <input style={styles.input} type="email" value={accountForm.contactEmail} onChange={(e) => setAccountForm((prev) => ({ ...prev, contactEmail: e.target.value }))} placeholder="yritys@yritys.fi" />
                  </div>
                  <div style={styles.field}>
                    <label>Puhelinnumero</label>
                    <input style={styles.input} value={accountForm.phone} onChange={(e) => setAccountForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="Puhelinnumero" />
                  </div>
                </>
              )}
              <div style={{ ...styles.row, justifyContent: "flex-end" }}>
                <button style={{ ...styles.button, ...styles.primaryButton }} onClick={handleSaveOwnDetails} disabled={accountSaving}>{accountSaving ? "Tallennetaan..." : "Tallenna tiedot"}</button>
              </div>
            </div>
            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack, background: "#f8fafc" }}>
              <strong>Vaihda salasana</strong>
              <div style={styles.field}>
                <label>Uusi salasana</label>
                <input style={styles.input} type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))} placeholder="Vähintään 8 merkkiä" />
              </div>
              <div style={styles.field}>
                <label>Uusi salasana uudelleen</label>
                <input style={styles.input} type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))} placeholder="Kirjoita salasana uudelleen" />
              </div>
              <div style={styles.muted}>Salasanan vaihto tehdään heti nykyiselle käyttäjätilille.</div>
              <div style={{ ...styles.row, justifyContent: "flex-end" }}>
                <button style={{ ...styles.button, ...styles.primaryButton }} onClick={handleChangePassword} disabled={passwordSaving}>{passwordSaving ? "Vaihdetaan..." : "Vaihda salasana"}</button>
              </div>
            </div>
          </div>
        ) : null}

        {authError ? <div style={{ ...styles.noticeError, marginBottom: 16 }}>{authError}</div> : null}
        {authInfo ? <div style={{ ...styles.noticeSuccess, marginBottom: 16 }}>{authInfo}</div> : null}

        <div style={tabStyle}>
          <button style={{ ...styles.tab, ...(activeTab === "dashboard" ? styles.activeTab : {}) }} onClick={() => setActiveTab("dashboard")}>Yhteenveto</button>
          <button style={{ ...styles.tab, ...(activeTab === "add" ? styles.activeTab : {}) }} onClick={() => setActiveTab("add")}>{profile.role === "processor" ? "Lisää jaloste-erä" : "Lisää saalis"}</button>
          <button style={{ ...styles.tab, ...(activeTab === "entries" ? styles.activeTab : {}) }} onClick={() => setActiveTab("entries")}>{profile.role === "processor" ? "Jaloste-erät" : "Saaliit"}</button>
          <button style={{ ...styles.tab, ...(activeTab === "offers" ? styles.activeTab : {}) }} onClick={() => setActiveTab("offers")}>Tarjoukset</button>
          <button style={{ ...styles.tab, ...(activeTab === "reports" ? styles.activeTab : {}) }} onClick={() => setActiveTab("reports")}>Raportit</button>
          {profile.role === "owner" ? <button style={{ ...styles.tab, ...(activeTab === "buyers" ? styles.activeTab : {}) }} onClick={() => setActiveTab("buyers")}>Ostajat</button> : null}
          {profile.role === "owner" ? <button style={{ ...styles.tab, ...(activeTab === "users" ? styles.activeTab : {}) }} onClick={() => setActiveTab("users")}>Käyttäjät</button> : null}
          {profile.role === "owner" ? <button style={{ ...styles.tab, ...(activeTab === "billing" ? styles.activeTab : {}) }} onClick={() => setActiveTab("billing")}>Laskutus</button> : null}
        </div>

        {activeTab === "dashboard" ? (
          <div style={styles.stack}>
            {profile.role !== "buyer" ? (
              <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
                <strong>{profile.role === "processor" ? "Jalostajan tiedot" : "Kalastajan tiedot"}</strong>
                {profile.role === "processor" ? (
                  <div style={styles.field}>
                    <label>Laitosnumero</label>
                    <input
                      style={styles.input}
                      value={fisherInfoForm.eviraFacilityId}
                      onChange={(e) => setFisherInfoForm((prev) => ({ ...prev, eviraFacilityId: e.target.value }))}
                      placeholder="Esim. F12345"
                    />
                  </div>
                ) : (
                  <>
                    <div style={styles.field}>
                      <label>Kaupallisen kalastusaluksen tunnukset</label>
                      <textarea
                        style={styles.textarea}
                        value={fisherInfoForm.commercialFishingVesselIdsText}
                        onChange={(e) => setFisherInfoForm((prev) => ({ ...prev, commercialFishingVesselIdsText: e.target.value }))}
                        placeholder={"Yksi tunnus per rivi\nEsim. FIN1234A"}
                      />
                    </div>
                    <div style={styles.field}>
                      <label>Kaupallisen kalastajan tunnus</label>
                      <input
                        style={styles.input}
                        value={fisherInfoForm.commercialFishingId}
                        onChange={(e) => setFisherInfoForm((prev) => ({ ...prev, commercialFishingId: e.target.value }))}
                        placeholder="Esim. 123456"
                      />
                    </div>
                  </>
                )}
                <div>
                  <button
                    style={{ ...styles.button, ...styles.primaryButton }}
                    onClick={async () => {
                      const vesselIds = parseCommercialFishingVesselIds(fisherInfoForm.commercialFishingVesselIdsText);
                      const vesselIdsText = vesselIds.join("\n");
                      const profileUpdatePayload = profile.role === "processor"
                        ? {
                            evira_facility_id: fisherInfoForm.eviraFacilityId.trim() || null,
                          }
                        : {
                            commercial_fishing_vessel_id: vesselIdsText || null,
                            commercial_fishing_id: fisherInfoForm.commercialFishingId.trim() || null,
                          };
                      const { data, error } = await supabase
                        .from("profiles")
                        .update(profileUpdatePayload)
                        .eq("id", profile.id)
                        .select("*")
                        .single();
                      if (error) {
                        setAuthError(error.message);
                        return;
                      }
                      setProfile(data);
                      fisherInfoSyncingRef.current = true;
                      setFisherInfoForm({
                        commercialFishingId: data.commercial_fishing_id || "",
                        commercialFishingVesselId: data.commercial_fishing_vessel_id || "",
                        commercialFishingVesselIdsText: getCommercialFishingVesselIds(data).join("\n"),
                        eviraFacilityId: data.evira_facility_id || "",
                      });
                      setAccountFormDirty(false);
                      setFisherInfoDirty(false);
                      setAuthInfo(profile.role === "processor" ? "Jalostajan tunnukset tallennettu." : "Kalastajan tunnukset tallennettu.");
                      setRefreshTick((prev) => prev + 1);
                    }}
                  >
                    Tallenna tunnukset
                  </button>
                </div>
              </div>
            ) : null}
            <div style={grid3}>
              <div style={{ ...styles.card, ...styles.sectionCard }}><div style={styles.metric}>{profile.role === "processor" ? totals.totalProcessedKg.toFixed(1) : totals.totalKg.toFixed(1)} kg</div><div style={styles.muted}>{profile.role === "processor" ? "Jalosteita yhteensä" : "Kokonaissaalis"}</div></div>
              <div style={{ ...styles.card, ...styles.sectionCard }}><div style={styles.metric}>{profile.role === "processor" ? totals.processedForSaleKg.toFixed(1) : totals.forSaleKg.toFixed(1)} kg</div><div style={styles.muted}>Tarjolla ostajille</div></div>
              <div style={{ ...styles.card, ...styles.sectionCard }}><div style={styles.metric}>{profile.role === "processor" ? processedEntries.length : entries.length}</div><div style={styles.muted}>{profile.role === "processor" ? "Tallennettuja jaloste-eriä" : "Tallennettuja eriä"}</div></div>
            </div>
            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
              <strong>{profile.role === "processor" ? "Tuotetyyppien yhteenveto" : "Lajikohtainen yhteenveto"}</strong>
              {profile.role === "processor"
                ? (totals.processedSummary.length === 0
                  ? <div style={styles.muted}>Ei vielä jaloste-eriä.</div>
                  : totals.processedSummary.map((item) => (
                    <div key={item.productType} style={{ ...styles.stack, gap: 6 }}>
                      <div style={styles.rowBetween}><span>{item.productType}</span><span>{item.kilos.toFixed(1)} kg</span></div>
                      <div style={styles.progress}><span style={{ ...styles.progressFill, width: `${Math.max((item.kilos / Math.max(totals.totalProcessedKg, 1)) * 100, 4)}%` }} /></div>
                    </div>
                  )))
                : (totals.speciesSummary.length === 0
                  ? <div style={styles.muted}>Ei vielä saalistietoja.</div>
                  : totals.speciesSummary.map((item) => (
                    <div key={item.species} style={{ ...styles.stack, gap: 6 }}>
                      <div style={styles.rowBetween}><span>{item.species}</span><span>{item.kilos.toFixed(1)} kg</span></div>
                      <div style={styles.progress}><span style={{ ...styles.progressFill, width: `${Math.max((item.kilos / Math.max(totals.totalKg, 1)) * 100, 4)}%` }} /></div>
                    </div>
                  )))}
            </div>
          </div>
        ) : null}

        {activeTab === "add" ? (
          profile.role === "processor" ? (
            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
              <div style={formGrid}>
                <div style={styles.field}><label>Tuotantopäivä</label><input style={styles.input} type="date" value={processedForm.productionDate} onChange={(e) => setProcessedForm({ ...processedForm, productionDate: e.target.value })} /></div>
                <div style={styles.field}><label>Parasta ennen</label><input style={styles.input} type="date" value={processedForm.bestBeforeDate} onChange={(e) => setProcessedForm({ ...processedForm, bestBeforeDate: e.target.value })} /></div>
                <div style={styles.field}><label>Vesialue / alkuperä</label><select style={styles.input} value={processedForm.area} onChange={(e) => setProcessedForm({ ...processedForm, area: e.target.value })}>{defaultAreas.map((area) => <option key={area} value={area}>{area}</option>)}</select></div>
                <div style={styles.field}><label>Paikkakunta</label><MunicipalitySelect value={processedForm.municipality} onChange={(e) => setProcessedForm({ ...processedForm, municipality: e.target.value })} /></div>
                <div style={styles.field}><label>Tuotenimi</label><input style={styles.input} value={processedForm.productName} onChange={(e) => setProcessedForm({ ...processedForm, productName: e.target.value })} placeholder="Esim. Kylmäsavulohi viipale" /></div>
                <div style={styles.field}><label>Tuotetyyppi</label><select style={styles.input} value={processedForm.productType} onChange={(e) => setProcessedForm({ ...processedForm, productType: e.target.value })}>{processedProductTypes.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
                <div style={styles.field}><label>Käsittelytapa</label><select style={styles.input} value={processedForm.processingMethod} onChange={(e) => setProcessedForm({ ...processedForm, processingMethod: e.target.value })}>{processingMethods.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
                <div style={styles.field}><label>Käsittelypaikka</label><input style={styles.input} value={processedForm.spot} onChange={(e) => setProcessedForm({ ...processedForm, spot: e.target.value })} placeholder="Esim. jalostuskontti / Forelli" /></div>
                <div style={{ ...styles.field, ...styles.fieldFull, ...styles.stack }}>
                  <label>{profile.role === "processor" ? "Liitä omat ostetut YKP-raaka-aine-erät" : "Liitä kalastajan YKP-raaka-aine-erät"}</label>
                  {availableSourceEntries.length === 0 ? (
                    <div style={styles.noticeInfo}>{profile.role === "processor" ? "Ei vielä omia hyväksytysti ostettuja YKP-raaka-aine-eriä linkitettäväksi." : "Ei vielä batch-tunnuksella tallennettuja saaliseriä linkitettäväksi."}</div>
                  ) : (
                    <div style={{ ...styles.stack, gap: 10 }}>
                      {availableSourceEntries.map((entry) => {
                        const checked = processedForm.sourceEntryIds.includes(entry.id);
                        return (
                          <label key={entry.id} style={{ ...styles.checkboxCard, justifyContent: "space-between", width: "100%", borderRadius: 18 }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  setProcessedForm((prev) => ({
                                    ...prev,
                                    sourceEntryIds: e.target.checked
                                      ? [...prev.sourceEntryIds, entry.id]
                                      : prev.sourceEntryIds.filter((id) => id !== entry.id),
                                  }));
                                }}
                              />
                              <span>{formatSourceBatchSummary(entry)}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {selectedProcessedSourceEntries.length > 0 ? (
                    <div style={{ ...styles.stack, gap: 8 }}>
                      <div style={styles.small}>Valitut lähde-erät kulkevat jaloste-erän mukana jäljitettävyysketjussa.</div>
                      {selectedProcessedSourceEntries.map((entry) => (
                        <div key={entry.id} style={{ ...styles.entry, background: "#f8fbff" }}>
                          <div style={styles.rowBetween}>
                            <div style={{ ...styles.stack, gap: 6 }}>
                              <div><strong>{formatSpeciesForSale(entry.species)}</strong></div>
                              <div style={styles.muted}>{entry.kilos} kg · {entry.date} · {entry.batchId}</div>
                            </div>
                            <div style={styles.qrBlock}>
                              <img src={getBatchQrImageUrl(entry.batchId)} alt={`QR ${entry.batchId}`} style={styles.qrImage} />
                              <div style={styles.small}>Lähde-erän QR</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div style={{ ...styles.field, ...styles.fieldFull }}><label>Raaka-aine / lajiyhteenveto</label><textarea style={styles.textarea} value={processedForm.speciesSummary} onChange={(e) => setProcessedForm({ ...processedForm, speciesSummary: e.target.value })} placeholder="Esim. lohi fileenä, kuha fileenä, muikkumassa" /></div>
                <div style={styles.field}><label>Määrä kg</label><input style={styles.input} type="number" value={processedForm.kilos} onChange={(e) => setProcessedForm({ ...processedForm, kilos: e.target.value })} placeholder="0" /></div>
                <div style={styles.field}><label>Pakkauskoko g</label><input style={styles.input} type="number" value={processedForm.packageSizeG} onChange={(e) => setProcessedForm({ ...processedForm, packageSizeG: e.target.value })} placeholder="Esim. 500" /></div>
                <div style={styles.field}><label>Pakkausten määrä</label><input style={styles.input} type="number" value={processedForm.packageCount} onChange={(e) => setProcessedForm({ ...processedForm, packageCount: e.target.value })} placeholder="Esim. 40" /></div>
                <div style={styles.field}><label>Lähtöpaikka / jalostajan sijainti</label><MunicipalitySelect value={currentProcessedOriginCity} onChange={(e) => setProcessedForm({ ...processedForm, originCity: e.target.value, originPointId: "" })} /></div>
                <div style={styles.field}><label><input type="checkbox" checked={processedForm.deliveryPossible} onChange={(e) => setProcessedForm({ ...processedForm, deliveryPossible: e.target.checked, deliveryMethod: e.target.checked ? "Kuljetus järjestetään" : "Nouto", transportMode: e.target.checked ? processedForm.transportMode : "", originPointId: e.target.checked ? processedForm.originPointId : "", deliveryDestinations: e.target.checked ? processedForm.deliveryDestinations : [] })} /> Kilpailuta kuljetus</label></div>
                <div style={styles.field}><label>Aikaisin toimitus</label><input style={styles.input} type="date" value={processedForm.earliestDeliveryDate} onChange={(e) => setProcessedForm({ ...processedForm, earliestDeliveryDate: e.target.value })} /></div>
                <div style={styles.field}><label><input type="checkbox" checked={processedForm.coldTransport} onChange={(e) => setProcessedForm({ ...processedForm, coldTransport: e.target.checked })} /> Kylmäkuljetus</label></div>
                {processedForm.deliveryPossible ? (
                  <>
                    <div style={{ ...styles.field, ...styles.fieldFull, ...styles.stack }}>
                      <label>Kuljetus järjestetään</label>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                        {[
                          { value: "terminal", title: "Vie terminaaliin", detail: "Valitse terminaali ja viimeinen jättöaika." },
                          { value: "pickup", title: "Kuljetusfirma noutaa", detail: "Nouto nykyisestä lähtöpaikasta ja mahdollinen noutolisä." },
                          { value: "collection_point", title: "Vie keräilypisteeseen", detail: "Valitse lähialueen keräilypiste ja jättöaika." },
                        ].map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            style={{
                              ...styles.button,
                              textAlign: "left",
                              justifyContent: "flex-start",
                              padding: 16,
                              minHeight: 110,
                              background: processedForm.transportMode === option.value ? "linear-gradient(135deg, #2563eb, #0ea5e9)" : "#f8fbff",
                              color: processedForm.transportMode === option.value ? "#fff" : "#0f172a",
                              borderColor: processedForm.transportMode === option.value ? "#2563eb" : "#bfdbfe",
                            }}
                            onClick={() => setProcessedForm((prev) => ({
                              ...prev,
                              deliveryMethod: "Kuljetus järjestetään",
                              transportMode: option.value,
                              originPointId: option.value === "pickup" ? "" : prev.originPointId,
                              pickupAddress: option.value === "pickup" ? (prev.pickupAddress || savedPickupAddress) : prev.pickupAddress,
                              pickupSurcharge: option.value === "pickup" ? "12" : "",
                              estimatedPickupTime: option.value === "pickup" ? "Arkipäivisin klo 12–16" : "",
                            }))}
                          >
                            <span style={{ ...styles.stack, gap: 6 }}>
                              <strong>{option.title}</strong>
                              <span style={{ fontSize: 14, opacity: processedForm.transportMode === option.value ? 0.95 : 0.75 }}>{option.detail}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                    {processedForm.transportMode === "terminal" || processedForm.transportMode === "collection_point" ? (
                      <div style={{ ...styles.field, ...styles.fieldFull, ...styles.stack }}>
                        <label>{processedForm.transportMode === "terminal" ? "Valitse terminaali" : "Valitse keräilypiste"}</label>
                        {availableProcessedOriginPoints.length === 0 ? (
                          <div style={styles.noticeInfo}>Tälle alueelle ei löytynyt sopivaa luovutuspistettä. Vaihda lähtöpaikkaa tai kuljetustapaa.</div>
                        ) : (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
                            {availableProcessedOriginPoints.map((point) => (
                              <button
                                key={point.id}
                                type="button"
                                style={{
                                  ...styles.button,
                                  textAlign: "left",
                                  justifyContent: "flex-start",
                                  padding: 16,
                                  minHeight: 120,
                                  background: processedForm.originPointId === point.id ? "#eff6ff" : "#fff",
                                  borderColor: processedForm.originPointId === point.id ? "#2563eb" : "#cbd5e1",
                                }}
                                onClick={() => setProcessedForm((prev) => ({ ...prev, originPointId: point.id, deliveryArea: point.city }))}
                              >
                                <span style={{ ...styles.stack, gap: 6 }}>
                                  <strong>{point.name}</strong>
                                  <span style={styles.muted}>{point.address}</span>
                                  <span style={styles.small}>Viimeinen jättöaika: {point.latest_dropoff_time || "-"}</span>
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}
                    {processedForm.transportMode === "pickup" ? (
                      <div style={{ ...styles.field, ...styles.fieldFull, ...styles.stack }}>
                        <label>Noutotiedot</label>
                        <div style={styles.field}>
                          <label>Nouto-osoite</label>
                          <input
                            style={styles.input}
                            value={processedForm.pickupAddress || savedPickupAddress}
                            onChange={(e) => setProcessedForm((prev) => ({ ...prev, pickupAddress: e.target.value }))}
                            placeholder="Kirjoita nouto-osoite, jos sitä ei ole tallennettu omiin tietoihin"
                          />
                        </div>
                        <div style={styles.noticeInfo}>
                          Noutopaikka: {[resolvedProcessedPickupAddress, currentProcessedOriginCity, processedForm.spot].filter(Boolean).join(", ") || "-"}<br />
                          Noutolisä: {processedForm.pickupSurcharge !== "" ? `${processedForm.pickupSurcharge} €` : "-"}<br />
                          Arvioitu noutoaika: {processedForm.estimatedPickupTime || "-"}
                        </div>
                      </div>
                    ) : null}
                    <div style={{ ...styles.field, ...styles.fieldFull, ...styles.stack }}>
                      <div style={styles.rowBetween}>
                        <label>Toimituskohteet</label>
                        <button
                          type="button"
                          style={styles.button}
                          onClick={() => setProcessedForm((prev) => ({ ...prev, deliveryDestinations: suggestedProcessedDeliveryCities.filter((city) => !prev.originPointId || getRoutePrice(prev.originPointId, city, Number(prev.kilos || 0))).slice(0, 10) }))}
                        >
                          Ehdota kohteet
                        </button>
                      </div>
                      <div style={styles.small}>Mukana aina Helsinki, Vantaa ja Espoo. Tarjous näkyy vain ostajille, joille löytyy reittihinta.</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                        {availableProcessedDestinationCities.map((city) => {
                          const routePrice = processedForm.originPointId ? getRoutePrice(processedForm.originPointId, city, Number(processedForm.kilos || 0)) : null;
                          const checked = processedForm.deliveryDestinations.includes(city);
                          const disabled = Boolean(processedForm.originPointId) && !routePrice;
                          return (
                            <label key={city} style={{ ...styles.checkboxCard, opacity: disabled ? 0.55 : 1, justifyContent: "space-between", alignItems: "flex-start" }}>
                              <span style={{ display: "flex", gap: 10 }}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={disabled}
                                  onChange={(e) => setProcessedForm((prev) => ({
                                    ...prev,
                                    deliveryDestinations: e.target.checked
                                      ? Array.from(new Set([...prev.deliveryDestinations, city]))
                                      : prev.deliveryDestinations.filter((item) => item !== city),
                                  }))}
                                />
                                <span>{city}</span>
                              </span>
                              <span style={styles.small}>{routePrice ? `${Number(routePrice.price_eur || 0).toLocaleString("fi-FI")} € · cutoff ${routePrice.cutoff_time || "-"}` : "Ei hinnastoa"}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={styles.field}><label>Toimitustapa</label><select style={styles.input} value={processedForm.deliveryMethod} onChange={(e) => setProcessedForm({ ...processedForm, deliveryMethod: e.target.value })}>{deliveryMethods.map((method) => <option key={method} value={method}>{method}</option>)}</select></div>
                    <div style={styles.field}><label>Toimitusalue</label><input style={styles.input} value={processedForm.deliveryArea} onChange={(e) => setProcessedForm({ ...processedForm, deliveryArea: e.target.value })} placeholder="Esim. Etelä-Suomi" /></div>
                    <div style={styles.field}><label>Toimituskustannus €</label><input style={styles.input} type="number" value={processedForm.deliveryCost} onChange={(e) => setProcessedForm({ ...processedForm, deliveryCost: e.target.value })} placeholder="Esim. 65" /></div>
                  </>
                )}
                <div style={{ ...styles.field, ...styles.fieldFull }}>
                  <label>Tarjoa jaloste-erää myyntiin</label>
                  <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                    <label><input type="checkbox" checked={processedForm.offerToShops} onChange={(e) => setProcessedForm({ ...processedForm, offerToShops: e.target.checked })} /> Kauppoihin</label>
                    <label><input type="checkbox" checked={processedForm.offerToRestaurants} onChange={(e) => setProcessedForm({ ...processedForm, offerToRestaurants: e.target.checked })} /> Ravintoloihin</label>
                    <label><input type="checkbox" checked={processedForm.offerToWholesalers} onChange={(e) => setProcessedForm({ ...processedForm, offerToWholesalers: e.target.checked })} /> Tukkuihin</label>
                  </div>
                </div>
                <div style={{ ...styles.field, ...styles.fieldFull }}><label>Lisätiedot</label><textarea style={styles.textarea} value={processedForm.notes} onChange={(e) => setProcessedForm({ ...processedForm, notes: e.target.value })} placeholder="Esim. allergeenit, säilytys, pakkausmuoto, toimitusrytmi" /></div>
              </div>
              <div style={{ ...styles.row, justifyContent: "flex-end" }}><button style={{ ...styles.button, ...styles.primaryButton }} onClick={handleSaveProcessed} disabled={saving}>{saving ? "Tallennetaan..." : shouldSendProcessedOffer ? "Tallenna jaloste-erä ja lähetä tarjous" : "Tallenna jaloste-erä"}</button></div>
            </div>
          ) : (
            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
              <div style={formGrid}>
                <div style={styles.field}><label>Pyyntipäivämäärä</label><input style={styles.input} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
                <div style={styles.field}><label>Vesialue</label><select style={styles.input} value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}>{defaultAreas.map((area) => <option key={area} value={area}>{area}</option>)}</select></div>
                <div style={styles.field}>
                  <label>Paikkakunta</label>
                  <MunicipalitySelect value={form.municipality} onChange={(e) => setForm({ ...form, municipality: e.target.value })} />
                </div>
                <div style={styles.field}><label>Tarkempi pyyntipaikka</label><input style={styles.input} value={form.spot} onChange={(e) => setForm({ ...form, spot: e.target.value })} placeholder="Esim. Isoselkä" /></div>
                <div style={styles.field}><label>Kirjaaja</label><input style={styles.input} value={profile.display_name} disabled /></div>
                {commercialFishingVesselOptions.length > 0 ? (
                  <div style={styles.field}>
                    <label>Käytetty kaupallinen kalastusalus</label>
                    <label style={{ ...styles.row, gap: 8, marginBottom: 8, fontWeight: 500, color: "#334155" }}>
                      <input
                        type="checkbox"
                        checked={Boolean(form.fishingWithoutVessel)}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            fishingWithoutVessel: e.target.checked,
                            selectedVesselId: e.target.checked ? "" : (prev.selectedVesselId || commercialFishingVesselOptions[0] || ""),
                          }))}
                      />
                      <span>Kalastus ilman alusta</span>
                    </label>
                    <select
                      style={styles.input}
                      value={form.selectedVesselId}
                      disabled={Boolean(form.fishingWithoutVessel)}
                      onChange={(e) => setForm({ ...form, selectedVesselId: e.target.value })}
                    >
                      {commercialFishingVesselOptions.map((vesselId) => (
                        <option key={vesselId} value={vesselId}>
                          {vesselId}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div style={styles.field}>
                    <label>Käytetty kaupallinen kalastusalus</label>
                    <label style={{ ...styles.row, gap: 8, marginTop: 8, fontWeight: 500, color: "#334155" }}>
                      <input
                        type="checkbox"
                        checked={Boolean(form.fishingWithoutVessel)}
                        onChange={(e) => setForm((prev) => ({ ...prev, fishingWithoutVessel: e.target.checked }))}
                      />
                      <span>Kalastus ilman alusta</span>
                    </label>
                  </div>
                )}
                <div style={{ ...styles.field, ...styles.fieldFull, ...styles.speciesBox, ...styles.stack }}>
                  <div style={styles.rowBetween}><div><label>KALAERÄ</label></div><button style={styles.button} type="button" onClick={addSpeciesRow}>Lisää laji</button></div>
                  {speciesRows.map((row, index) => (
                    <div key={row.id} style={speciesRow}>
                      <div style={styles.field}>
                        <label>Laji {index + 1}</label>
                        <select style={styles.input} value={row.species} onChange={(e) => updateSpeciesRow(row.id, "species", e.target.value)}>{fishSpecies.map((species) => <option key={species} value={species}>{species}</option>)}</select>
                        {row.species === "Muu" ? <input style={{ ...styles.input, marginTop: 8 }} placeholder="Kirjoita kalalaji" value={row.customSpecies} onChange={(e) => updateSpeciesRow(row.id, "customSpecies", e.target.value)} /> : null}
                      </div>
                      <div style={styles.field}><label>Kg</label><input style={styles.input} type="number" placeholder="0" value={row.kilos} onChange={(e) => updateSpeciesRow(row.id, "kilos", e.target.value)} /></div>
                      <div style={styles.field}><label>{`Hinta (€/${getSpeciesPriceUnit(getSpeciesRowLabel(row))})`}</label><input style={styles.input} type="number" step="0.01" placeholder={isCrayfishSpecies(getSpeciesRowLabel(row)) ? "Esim. 2.00" : "Esim. 5.50"} value={row.price_per_kg} onChange={(e) => updateSpeciesRow(row.id, "price_per_kg", e.target.value)} /></div>
                      <div style={styles.field}><label>{isCrayfishSpecies(getSpeciesRowLabel(row)) ? "Kpl (pakollinen)" : "Kpl"}</label><input style={styles.input} type="number" placeholder="0" value={row.count} onChange={(e) => updateSpeciesRow(row.id, "count", e.target.value)} /></div>
                      <div style={styles.row}><button style={styles.button} type="button" onClick={() => duplicateSpeciesRow(row.id)}>Kopioi</button><button style={styles.button} type="button" onClick={() => removeSpeciesRow(row.id)}>Poista</button></div>
                    </div>
                  ))}
                </div>
                <div style={styles.field}><label>Pyydys</label><select style={styles.input} value={form.gear} onChange={(e) => setForm({ ...form, gear: e.target.value })}>{gearTypes.map((gear) => <option key={gear} value={gear}>{gear}</option>)}</select></div>
                <div style={styles.field}><label>Lähtöpaikka / kalastajan sijainti</label><MunicipalitySelect value={currentOriginCity} onChange={(e) => setForm({ ...form, originCity: e.target.value, originPointId: "" })} /></div>
                <div style={styles.field}><label><input type="checkbox" checked={form.deliveryPossible} onChange={(e) => setForm({ ...form, deliveryPossible: e.target.checked, deliveryMethod: e.target.checked ? "Kuljetus järjestetään" : "Nouto", transportMode: e.target.checked ? form.transportMode : "", originPointId: e.target.checked ? form.originPointId : "", deliveryDestinations: e.target.checked ? form.deliveryDestinations : [] })} /> Kilpailuta kuljetus</label></div>
                <div style={styles.field}><label>Aikaisin toimitus</label><input style={styles.input} type="date" value={form.earliestDeliveryDate} onChange={(e) => setForm({ ...form, earliestDeliveryDate: e.target.value })} /></div>
                <div style={styles.field}><label><input type="checkbox" checked={form.coldTransport} onChange={(e) => setForm({ ...form, coldTransport: e.target.checked })} /> Kylmäkuljetus</label></div>
                {form.deliveryPossible ? (
                  <>
                    <div style={{ ...styles.field, ...styles.fieldFull, ...styles.stack }}>
                      <label>Kuljetus järjestetään</label>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                        {[
                          { value: "terminal", title: "Vie terminaaliin", detail: "Valitse terminaali ja viimeinen jättöaika." },
                          { value: "pickup", title: "Kuljetusfirma noutaa", detail: "Nouto nykyisestä lähtöpaikasta ja mahdollinen noutolisä." },
                          { value: "collection_point", title: "Vie keräilypisteeseen", detail: "Valitse lähialueen keräilypiste ja jättöaika." },
                        ].map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            style={{
                              ...styles.button,
                              textAlign: "left",
                              justifyContent: "flex-start",
                              padding: 16,
                              minHeight: 110,
                              background: form.transportMode === option.value ? "linear-gradient(135deg, #2563eb, #0ea5e9)" : "#f8fbff",
                              color: form.transportMode === option.value ? "#fff" : "#0f172a",
                              borderColor: form.transportMode === option.value ? "#2563eb" : "#bfdbfe",
                            }}
                            onClick={() => setForm((prev) => ({
                              ...prev,
                              deliveryMethod: "Kuljetus järjestetään",
                              transportMode: option.value,
                              originPointId: option.value === "pickup" ? "" : prev.originPointId,
                              pickupAddress: option.value === "pickup" ? (prev.pickupAddress || savedPickupAddress) : prev.pickupAddress,
                              pickupSurcharge: option.value === "pickup" ? "12" : "",
                              estimatedPickupTime: option.value === "pickup" ? "Arkipäivisin klo 12–16" : "",
                            }))}
                          >
                            <span style={{ ...styles.stack, gap: 6 }}>
                              <strong>{option.title}</strong>
                              <span style={{ fontSize: 14, opacity: form.transportMode === option.value ? 0.95 : 0.75 }}>{option.detail}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                    {form.transportMode === "terminal" || form.transportMode === "collection_point" ? (
                      <div style={{ ...styles.field, ...styles.fieldFull, ...styles.stack }}>
                        <label>{form.transportMode === "terminal" ? "Valitse terminaali" : "Valitse keräilypiste"}</label>
                        {availableOriginPoints.length === 0 ? (
                          <div style={styles.noticeInfo}>Tälle alueelle ei löytynyt sopivaa luovutuspistettä. Vaihda lähtöpaikkaa tai kuljetustapaa.</div>
                        ) : (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
                            {availableOriginPoints.map((point) => (
                              <button
                                key={point.id}
                                type="button"
                                style={{
                                  ...styles.button,
                                  textAlign: "left",
                                  justifyContent: "flex-start",
                                  padding: 16,
                                  minHeight: 120,
                                  background: form.originPointId === point.id ? "#eff6ff" : "#fff",
                                  borderColor: form.originPointId === point.id ? "#2563eb" : "#cbd5e1",
                                }}
                                onClick={() => setForm((prev) => ({ ...prev, originPointId: point.id, deliveryArea: point.city }))}
                              >
                                <span style={{ ...styles.stack, gap: 6 }}>
                                  <strong>{point.name}</strong>
                                  <span style={styles.muted}>{point.address}</span>
                                  <span style={styles.small}>Viimeinen jättöaika: {point.latest_dropoff_time || "-"}</span>
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}
                    {form.transportMode === "pickup" ? (
                      <div style={{ ...styles.field, ...styles.fieldFull, ...styles.stack }}>
                        <label>Noutotiedot</label>
                        <div style={styles.field}>
                          <label>Nouto-osoite</label>
                          <input
                            style={styles.input}
                            value={form.pickupAddress || savedPickupAddress}
                            onChange={(e) => setForm((prev) => ({ ...prev, pickupAddress: e.target.value }))}
                            placeholder="Kirjoita nouto-osoite, jos sitä ei ole tallennettu omiin tietoihin"
                          />
                        </div>
                        <div style={styles.noticeInfo}>
                          Noutopaikka: {[resolvedPickupAddress, currentOriginCity, form.spot].filter(Boolean).join(", ") || "-"}<br />
                          Noutolisä: {form.pickupSurcharge !== "" ? `${form.pickupSurcharge} €` : "-"}<br />
                          Arvioitu noutoaika: {form.estimatedPickupTime || "-"}
                        </div>
                      </div>
                    ) : null}
                    <div style={{ ...styles.field, ...styles.fieldFull, ...styles.stack }}>
                      <div style={styles.rowBetween}>
                        <label>Toimituskohteet</label>
                        <button
                          type="button"
                          style={styles.button}
                          onClick={() => setForm((prev) => ({ ...prev, deliveryDestinations: getSuggestedDestinationCities(currentOriginCity, prev.area).filter((city) => !prev.originPointId || getRoutePrice(prev.originPointId, city, speciesRows.reduce((sum, row) => sum + Number(row.kilos || 0), 0))).slice(0, 10) }))}
                        >
                          Ehdota kohteet
                        </button>
                      </div>
                      <div style={styles.small}>Mukana aina Helsinki, Vantaa ja Espoo. Tarjous näkyy vain ostajille, joille löytyy reittihinta.</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                        {availableDestinationCities.map((city) => {
                          const routePrice = form.originPointId ? getRoutePrice(form.originPointId, city, speciesRows.reduce((sum, row) => sum + Number(row.kilos || 0), 0)) : null;
                          const checked = form.deliveryDestinations.includes(city);
                          const disabled = Boolean(form.originPointId) && !routePrice;
                          return (
                            <label key={city} style={{ ...styles.checkboxCard, opacity: disabled ? 0.55 : 1, justifyContent: "space-between", alignItems: "flex-start" }}>
                              <span style={{ display: "flex", gap: 10 }}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={disabled}
                                  onChange={(e) => setForm((prev) => ({
                                    ...prev,
                                    deliveryDestinations: e.target.checked
                                      ? Array.from(new Set([...prev.deliveryDestinations, city]))
                                      : prev.deliveryDestinations.filter((item) => item !== city),
                                  }))}
                                />
                                <span style={{ ...styles.stack, gap: 4 }}>
                                  <strong>{city}</strong>
                                  <span style={styles.small}>{routePrice ? `${formatDeliveryPrice(routePrice.price_eur)} · cut-off ${routePrice.cutoff_time}` : "Ei hinnastoa valitusta luovutuspisteestä"}</span>
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={styles.field}><label>Toimitustapa</label><select style={styles.input} value={form.deliveryMethod} onChange={(e) => setForm({ ...form, deliveryMethod: e.target.value })}>{deliveryMethods.map((method) => <option key={method} value={method}>{method}</option>)}</select></div>
                    <div style={styles.field}>
                      <label>{form.deliveryMethod === "Nouto" ? "Nouto-osoite" : "Toimitusalue"}</label>
                      <input
                        style={styles.input}
                        placeholder={form.deliveryMethod === "Nouto" ? "Esim. Satamakatu 1, Kuopio" : "Esim. Etelä-Suomi / Helsinki / koko Suomi"}
                        value={form.deliveryArea}
                        onChange={(e) => setForm({ ...form, deliveryArea: e.target.value })}
                      />
                    </div>
                    <div style={styles.field}><label>Toimituskustannus €</label><input style={styles.input} type="number" placeholder="Esim. 90" value={form.deliveryCost} onChange={(e) => setForm({ ...form, deliveryCost: e.target.value })} /></div>
                  </>
                )}
                <div style={{ ...styles.field, ...styles.fieldFull }}>
                  <div style={{ ...styles.offerBox, ...styles.stack }}>
                    <div>
                      <label>Tarjoa erää myyntiin</label>
                      <div style={styles.small}>Valitse ostajaryhmät, joille tämä kalaerä lähetetään heti tallennuksen yhteydessä.</div>
                    </div>
                    <div style={styles.checkboxRow}>
                      <label style={styles.checkboxCard}><input type="checkbox" checked={form.offerToShops} onChange={(e) => setForm({ ...form, offerToShops: e.target.checked })} /> Kauppoihin</label>
                      <label style={styles.checkboxCard}><input type="checkbox" checked={form.offerToRestaurants} onChange={(e) => setForm({ ...form, offerToRestaurants: e.target.checked })} /> Ravintoloihin</label>
                      <label style={styles.checkboxCard}><input type="checkbox" checked={form.offerToWholesalers} onChange={(e) => setForm({ ...form, offerToWholesalers: e.target.checked })} /> Tukkuihin</label>
                    </div>
                  </div>
                </div>
                <div style={{ ...styles.field, ...styles.fieldFull }}><label>Lisätiedot</label><textarea style={styles.textarea} placeholder="Esim. laatu, jäähdytys, toimitus, huomioita" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              </div>
              <div style={{ ...styles.row, justifyContent: "flex-end" }}><button style={{ ...styles.button, ...styles.primaryButton }} onClick={handleSave} disabled={saving}>{saving ? "Tallennetaan..." : shouldSendOffer ? "Tallenna saalis ja lähetä tarjous" : "Tallenna saalis"}</button></div>
            </div>
          )
        ) : null}

        {activeTab === "entries" ? (
          profile.role === "processor" ? (
            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
              <div style={styles.rowBetween}><strong>Omat jaloste-erät</strong><input style={{ ...styles.input, maxWidth: 360 }} placeholder="Hae tuotteella, alueella tai käsittelyllä..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
              {processedEntries.filter((entry) => {
                const q = search.trim().toLowerCase();
                if (!q) return true;
                return [entry.productName, entry.productType, entry.processingMethod, entry.speciesSummary, entry.area, entry.municipality, entry.spot, entry.notes, entry.ownerName].join(" ").toLowerCase().includes(q);
              }).length === 0 ? <div style={styles.muted}>Ei hakutuloksia.</div> : processedEntries.filter((entry) => {
                const q = search.trim().toLowerCase();
                if (!q) return true;
                return [entry.productName, entry.productType, entry.processingMethod, entry.speciesSummary, entry.area, entry.municipality, entry.spot, entry.notes, entry.ownerName].join(" ").toLowerCase().includes(q);
              }).map((entry) => (
                <div key={entry.id} style={styles.entry}>
                  <div style={styles.entryHeader}>
                    <div>
                      <div style={styles.entryBadges}>
                        <span style={styles.badge}>{entry.productName}</span>
                        <span style={styles.badge}>{entry.productType}</span>
                        <span style={styles.badge}>{entry.kilos} kg</span>
                        {entry.packageSizeG !== "" ? <span style={styles.badge}>{entry.packageSizeG} g</span> : null}
                        {entry.packageCount !== "" ? <span style={styles.badge}>{entry.packageCount} pkt</span> : null}
                      </div>
                      <div style={styles.muted}>{entry.productionDate} · {entry.area}{entry.municipality ? ` · ${entry.municipality}` : ""}{entry.spot ? ` / ${entry.spot}` : ""}</div>
                      {entry.batchId ? <div style={styles.muted}>Erätunnus: {entry.batchId}</div> : null}
                      {entry.batchId ? <div style={{ ...styles.qrBlock, marginTop: 8 }}><img src={getBatchQrImageUrl(entry.batchId)} alt={`QR ${entry.batchId}`} style={styles.qrImage} /><div style={styles.small}>QR-koodi erälle</div></div> : null}
                      <div style={styles.muted}>Käsittely: {entry.processingMethod || "-"} · Raaka-aine: {entry.speciesSummary || "-"}</div>
                      {Array.isArray(entry.sourceBatches) && entry.sourceBatches.length > 0 ? (
                        <div style={{ ...styles.stack, gap: 8, marginTop: 8 }}>
                          <div style={styles.muted}><strong>Linkitetyt lähde-erät</strong></div>
                          {entry.sourceBatches.map((source) => (
                            <div key={`${entry.id}-${source.batchId}-${source.sourceEntryId || source.species}`} style={{ ...styles.entry, background: "#f8fbff", padding: 12 }}>
                              <div style={styles.rowBetween}>
                                <div style={{ ...styles.stack, gap: 6 }}>
                                  <div style={styles.muted}>Erätunnus: {source.batchId}</div>
                                  <div style={styles.muted}>Laji: {formatSpeciesForSale(source.species)}</div>
                                  <div style={styles.muted}>Määrä: {source.kilos !== "" && source.kilos != null ? `${source.kilos} kg` : "-"}</div>
                                </div>
                                {source.qrImageUrl ? (
                                  <div style={styles.qrBlock}>
                                    <img src={source.qrImageUrl} alt={`QR ${source.batchId}`} style={styles.qrImage} />
                                    <div style={styles.small}>Lähde-erän QR</div>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <div style={styles.muted}>Parasta ennen: {entry.bestBeforeDate || "-"}</div>
                      <div style={styles.muted}>Toimitus: {entry.deliveryMethod || "-"} · {entry.deliveryArea || "-"} · Kulu {entry.deliveryCost !== "" && entry.deliveryCost != null ? `${entry.deliveryCost} €` : "-"} · Aikaisin {entry.earliestDeliveryDate || "-"} · Kylmäkuljetus {entry.coldTransport ? "kyllä" : "ei"}</div>
                      {entry.notes ? <div style={styles.muted}>{entry.notes}</div> : null}
                    </div>
                    <button style={styles.button} onClick={() => handleDeleteProcessedEntry(entry)}>Poista jaloste-erä</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
              <div style={styles.rowBetween}><strong>{profile.role === "owner" && entryScope === "all" ? "Kaikkien saaliit" : "Omat saaliit"}</strong><input style={{ ...styles.input, maxWidth: 360 }} placeholder="Hae lajilla, paikalla, pyydyksellä..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
              {groupedFilteredEntries.length === 0 ? <div style={styles.muted}>Ei hakutuloksia.</div> : groupedFilteredEntries.map((group) => (
                <div key={group.key} style={{ ...styles.stack, gap: 12 }}>
                  <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack, background: "#f8fbff" }}>
                    <div style={styles.rowBetween}>
                      <strong style={{ textTransform: "capitalize" }}>{group.label}</strong>
                      <div style={styles.entryBadges}>
                        <span style={styles.badge}>{group.entries.length} erää</span>
                        <span style={styles.badge}>{group.totalKilos.toFixed(1)} kg yhteensä</span>
                        <span style={styles.badge}>{group.forSaleKilos.toFixed(1)} kg myynnissä</span>
                      </div>
                    </div>
                    {group.speciesSummary.length > 0 ? (
                      <div style={{ ...styles.stack, gap: 8 }}>
                        <div style={styles.muted}><strong>Kalalajit kuukaudelta</strong></div>
                        {group.speciesSummary.map((item) => (
                          <div key={item.species} style={styles.rowBetween}>
                            <span>{item.species}</span>
                            <span>{item.kilos.toFixed(1)} kg</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {group.entries.map((entry) => (
                    <div key={entry.id} style={styles.entry}>
                      <div style={styles.entryHeader}>
                        <div>
                          <div style={styles.entryBadges}>
                            <span style={styles.badge}>{formatSpeciesForSale(entry.species)}</span>
                            <span style={styles.badge}>{entry.kilos} kg</span>
                            <span style={styles.badge}>{entry.gear}</span>
                            <span style={styles.badge}>{entry.ownerName}</span>
                          </div>
                          <div style={styles.muted}>{entry.date} · {entry.area}{entry.municipality ? ` · ${entry.municipality}` : ""}{entry.spot ? ` / ${entry.spot}` : ""}</div>
                          {entry.batchId ? <div style={styles.muted}>Erätunnus: {entry.batchId}</div> : null}
                          {entry.batchId ? <div style={{ ...styles.qrBlock, marginTop: 8 }}><img src={getBatchQrImageUrl(entry.batchId)} alt={`QR ${entry.batchId}`} style={styles.qrImage} /><div style={styles.small}>QR-koodi erälle</div></div> : null}
                          {entry.pricePerKg !== "" && entry.pricePerKg != null ? <div style={styles.muted}>Hinta: {formatEntryPrice(entry.species, entry.pricePerKg)}</div> : null}
                          <div style={styles.muted}>Toimitus: {entry.deliveryMethod || "-"} · {entry.deliveryArea || "-"} · Kulu {entry.deliveryCost !== "" && entry.deliveryCost != null ? `${entry.deliveryCost} €` : "-"} · Aikaisin {entry.earliestDeliveryDate || "-"} · Kylmäkuljetus {entry.coldTransport ? "kyllä" : "ei"}</div>
                          {entry.commercialFishingId ? <div style={styles.muted}>Kaupallisen kalastajan tunnus: {entry.commercialFishingId}</div> : null}
                        </div>
                        <div style={styles.row}>
                          {canPrintCatchLabels(entry) ? <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => { setLabelPrintEntry(entry); setLabelPrintCount(10); }}>Tulosta etiketit</button> : null}
                          <button style={styles.button} onClick={() => handleDeleteEntry(entry)}>Poista saalistieto</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )
        ) : null}

        {activeTab === "offers" ? (
          <WholesaleOffersView
            profile={profile}
            saleEntries={profile.role === "processor" ? processedSaleEntries : saleEntries}
            offers={offers}
            buyerOffers={buyerOffers}
            offerForm={offerForm}
            setOfferForm={setOfferForm}
            onCreateOffer={handleCreateOffer}
            onUpdateOfferStatus={onUpdateOfferStatus}
            onUpdateBuyerOfferStatus={onUpdateBuyerOfferStatus}
            updateFulfillmentStatus={updateFulfillmentStatus}
            requestedOfferId={requestedOfferId}
            buyerTypeLabel={buyerTypeLabel}
            buyerStatusLabel={buyerStatusLabel}
            shouldRevealBuyerIdentity={shouldRevealBuyerIdentity}
          />
        ) : null}

        {activeTab === "reports" ? <ReportsView entries={entries} processedEntries={processedEntries} offers={offers} /> : null}

        {activeTab === "billing" && profile.role === "owner" ? (
          <BillingView
            buyerOffers={buyerOffers.map((offer) => ({ ...offer, ...calculateCommissionDetails(offer) }))}
            buyerStatusLabel={buyerStatusLabel}
            shouldRevealBuyerIdentity={shouldRevealBuyerIdentity}
            billingFilter={billingFilter}
            setBillingFilter={setBillingFilter}
            onUpdateBillingStatus={handleUpdateBillingStatus}
          />
        ) : null}

        {activeTab === "buyers" && profile.role === "owner" ? (
          <div style={grid2}>
            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
              <div style={styles.noticeInfo}>Owner näkee ostajarekisterin. Tavalliset käyttäjät eivät näe ostajien tietoja.

Tarjouslogiikka:
• Tukut: tarjous lähetetään vain jos erän koko on vähintään tukun määrittämä minimimäärä (min kg).
• Ravintolat: tarjous lähetetään vain jos erän koko on enintään ravintolan määrittämä maksimimäärä (max kg).
• Kaupat: tarjous lähetetään vain jos erän koko on kaupan min- ja max-rajan välissä.

Jokaiselle ostajalle lähetetään oma sähköposti, joten ostajat eivät näe toistensa yhteystietoja.</div>
              <div style={styles.field}><label>Yritys</label><input style={styles.input} value={buyerForm.company_name} onChange={(e) => setBuyerForm((prev) => ({ ...prev, company_name: e.target.value }))} placeholder="Esim. Ravintola Saimaa" /></div>
              <div style={styles.field}><label>Ryhmä</label><select style={styles.input} value={buyerForm.buyer_type} onChange={(e) => setBuyerForm((prev) => ({ ...prev, buyer_type: e.target.value }))}><option value="ravintola">Ravintola</option><option value="tukku">Tukku</option><option value="kauppa">Kauppa</option></select></div>
              <div style={styles.field}><label>Yhteyshenkilö</label><input style={styles.input} value={buyerForm.contact_name} onChange={(e) => setBuyerForm((prev) => ({ ...prev, contact_name: e.target.value }))} placeholder="Nimi" /></div>
              <div style={styles.field}><label>Sähköposti</label><input style={styles.input} type="email" value={buyerForm.email} onChange={(e) => setBuyerForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="email@yritys.fi" /></div>
              <div style={styles.field}><label>Puhelin</label><input style={styles.input} value={buyerForm.phone} onChange={(e) => setBuyerForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="Puhelin" /></div>
              <div style={styles.field}><label>Paikkakunta</label><MunicipalitySelect value={buyerForm.city} onChange={(e) => setBuyerForm((prev) => ({ ...prev, city: e.target.value }))} /></div>
              <div style={styles.field}><label>Min kg</label><input style={styles.input} type="number" value={buyerForm.min_kg} onChange={(e) => setBuyerForm((prev) => ({ ...prev, min_kg: e.target.value }))} placeholder="Esim. tukkuille" /></div>
              <div style={styles.field}><label>Max kg</label><input style={styles.input} type="number" value={buyerForm.max_kg} onChange={(e) => setBuyerForm((prev) => ({ ...prev, max_kg: e.target.value }))} placeholder="Esim. ravintoloille" /></div>
              <div style={styles.field}><label><input type="checkbox" checked={buyerForm.is_active} onChange={(e) => setBuyerForm((prev) => ({ ...prev, is_active: e.target.checked }))} /> Aktiivinen</label></div>
              <div style={styles.field}><label>Toimitusosoite</label><input style={styles.input} value={buyerForm.delivery_address} onChange={(e) => setBuyerForm((prev) => ({ ...prev, delivery_address: e.target.value, ...(buyerBillingSameAsDelivery ? { billing_address: e.target.value } : {}) }))} placeholder="Katuosoite" /></div>
              <div style={styles.field}><label>Toimitus postinumero</label><input style={styles.input} value={buyerForm.delivery_postcode} onChange={(e) => setBuyerForm((prev) => ({ ...prev, delivery_postcode: e.target.value, ...(buyerBillingSameAsDelivery ? { billing_postcode: e.target.value } : {}) }))} placeholder="00100" /></div>
              <div style={styles.field}><label>Toimitus kaupunki</label><MunicipalitySelect value={buyerForm.delivery_city} onChange={(e) => setBuyerForm((prev) => ({ ...prev, delivery_city: e.target.value, ...(buyerBillingSameAsDelivery ? { billing_city: e.target.value } : {}) }))} /></div>
              <div style={{ ...styles.field, ...styles.fieldFull }}><label><input type="checkbox" checked={buyerBillingSameAsDelivery} onChange={(e) => {
                const checked = e.target.checked;
                setBuyerBillingSameAsDelivery(checked);
                if (checked) applyBuyerDeliveryToBilling();
              }} /> Laskutustiedot samat kuin toimitustiedot</label></div>
              <div style={styles.field}><label>Laskutusosoite</label><input style={styles.input} value={buyerForm.billing_address} onChange={(e) => setBuyerForm((prev) => ({ ...prev, billing_address: e.target.value }))} placeholder="Katuosoite" /></div>
              <div style={styles.field}><label>Laskutus postinumero</label><input style={styles.input} value={buyerForm.billing_postcode} onChange={(e) => setBuyerForm((prev) => ({ ...prev, billing_postcode: e.target.value }))} placeholder="00100" /></div>
              <div style={styles.field}><label>Laskutus kaupunki</label><MunicipalitySelect value={buyerForm.billing_city} onChange={(e) => setBuyerForm((prev) => ({ ...prev, billing_city: e.target.value }))} /></div>
              <div style={styles.field}><label>Laskutussähköposti</label><input style={styles.input} type="email" value={buyerForm.billing_email} onChange={(e) => setBuyerForm((prev) => ({ ...prev, billing_email: e.target.value }))} placeholder="laskutus@yritys.fi" /></div>
              <div style={styles.field}><label>Y-tunnus</label><input style={styles.input} value={buyerForm.business_id} onChange={(e) => setBuyerForm((prev) => ({ ...prev, business_id: e.target.value }))} placeholder="1234567-8" /></div>
              <div style={styles.field}><label>Lisätiedot</label><textarea style={styles.textarea} value={buyerForm.notes} onChange={(e) => setBuyerForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Erätoiveet, toimitus, huomioita" /></div>
              {userMessage ? <div style={styles.noticeSuccess}>{userMessage}</div> : null}
              <div style={styles.row}>
                <button style={{ ...styles.button, ...styles.primaryButton }} onClick={handleSaveBuyer}>{buyerForm.id ? "Tallenna muutokset" : "Lisää ostaja"}</button>
                {buyerForm.id ? <button style={styles.button} onClick={resetBuyerForm}>Peruuta muokkaus</button> : null}
              </div>
            </div>
            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
              <strong>Ostajarekisteri</strong>
              {buyers.length === 0 ? <div style={styles.muted}>Ei vielä ostajia.</div> : buyers.map((buyer) => (
                <div key={buyer.id} style={styles.entry}>
                  <div style={styles.entryHeader}>
                    <div>
                      <div style={styles.entryBadges}>
                        <span style={styles.badge}>{buyer.company_name}</span>
                        <span style={styles.badge}>{buyer.buyer_type}</span>
                        <span style={styles.badge}>{buyer.email}</span>
                        <span style={styles.badge}>{buyer.is_active ? "Aktiivinen" : "Pois käytöstä"}</span>
                        {buyer.min_kg !== "" ? <span style={styles.badge}>Min {buyer.min_kg} kg</span> : null}
                        {buyer.max_kg !== "" ? <span style={styles.badge}>Max {buyer.max_kg} kg</span> : null}
                      </div>
                      <div style={styles.muted}>{buyer.contact_name || "-"}{buyer.phone ? ` · ${buyer.phone}` : ""}{buyer.city ? ` · ${buyer.city}` : ""}</div>
                      {buyer.notes ? <div style={styles.muted}>{buyer.notes}</div> : null}
                      {(buyer.delivery_address || buyer.delivery_postcode || buyer.delivery_city) ? <div style={styles.muted}><strong>Toimitus:</strong> {[buyer.delivery_address, buyer.delivery_postcode, buyer.delivery_city].filter(Boolean).join(", ")}</div> : null}
                      {(buyer.billing_address || buyer.billing_postcode || buyer.billing_city || buyer.billing_email || buyer.business_id) ? <div style={styles.muted}><strong>Laskutus:</strong> {[buyer.billing_address, buyer.billing_postcode, buyer.billing_city].filter(Boolean).join(", ")}{buyer.billing_email ? ` · ${buyer.billing_email}` : ""}{buyer.business_id ? ` · Y-tunnus ${buyer.business_id}` : ""}</div> : null}
                    </div>
                    <div style={styles.row}>
                      <button style={styles.button} onClick={() => startEditBuyer(buyer)}>Muokkaa</button>
                      <button style={styles.button} onClick={() => toggleBuyerActive(buyer)}>{buyer.is_active ? "Poista käytöstä" : "Aktivoi"}</button>
                      <button
                        style={{ ...styles.button, borderColor: "#fca5a5", color: "#b91c1c", background: "#fff1f2" }}
                        onClick={() => deleteBuyer(buyer)}
                      >
                        Poista kokonaan
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {activeTab === "users" && profile.role === "owner" ? (
          <div style={grid2}>
            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
              <div style={styles.noticeInfo}>Lisää tähän kollegan sähköposti. Sen jälkeen hän voi rekisteröityä itse omalla salasanallaan.</div>
              <div style={styles.field}><label>Nimi</label><input style={styles.input} value={newAllowedForm.displayName} onChange={(e) => setNewAllowedForm((prev) => ({ ...prev, displayName: e.target.value }))} placeholder="Esim. Antti Kalastaja" /></div>
              <div style={styles.field}><label>Sähköposti</label><input style={styles.input} type="email" value={newAllowedForm.email} onChange={(e) => setNewAllowedForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="esim. antti@yritys.fi" /></div>
              <div style={styles.field}><label>Rooli</label><select style={styles.input} value={newAllowedForm.role} onChange={(e) => setNewAllowedForm((prev) => ({ ...prev, role: e.target.value }))}><option value="member">Kalastaja</option><option value="processor">Jalostaja</option><option value="buyer">Ostaja</option><option value="owner">Omistaja</option></select></div>
              {newAllowedForm.role === "buyer" ? (
                <div style={styles.field}>
                  <label>Liitetty ostaja</label>
                  <select
                    style={styles.input}
                    value={newAllowedForm.buyer_id}
                    onChange={(e) => setNewAllowedForm((prev) => ({ ...prev, buyer_id: e.target.value }))}
                  >
                    <option value="">Valitse ostaja</option>
                    {buyers.map((buyer) => (
                      <option key={buyer.id} value={buyer.id}>
                        {buyer.company_name} ({buyer.email})
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {userMessage ? <div style={styles.noticeSuccess}>{userMessage}</div> : null}
              <button style={{ ...styles.button, ...styles.primaryButton }} onClick={handleCreateAllowedUser}>Lisää sallittuihin</button>
            </div>
            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
              <strong>Käyttäjähallinta</strong>
              {pendingProfiles.length > 0 ? (
                <div style={{ ...styles.stack, marginBottom: 12 }}>
                  <div style={{ ...styles.card, ...styles.sectionCard, padding: "12px 16px", background: "#fff7ed", borderColor: "#fdba74" }}>
                    <strong>Odottaa hyväksyntää</strong>
                  </div>
                  {pendingProfiles.map((pendingProfile) => (
                    <div key={pendingProfile.id} style={styles.entry}>
                      <div style={styles.entryHeader}>
                        <div>
                          <div style={styles.entryBadges}>
                            <span style={styles.badge}>{pendingProfile.display_name || "-"}</span>
                            <span style={styles.badge}>{pendingProfile.email}</span>
                            <span style={styles.badge}>{roleLabel(pendingProfile.role)}</span>
                            <span style={{ ...styles.badge, background: "#fff7ed", borderColor: "#fdba74", color: "#9a3412" }}>Odottaa hyväksyntää</span>
                          </div>
                          {(pendingProfile.company_name || pendingProfile.phone || pendingProfile.city) ? (
                            <div style={styles.muted}>
                              {[pendingProfile.company_name, pendingProfile.phone, pendingProfile.city].filter(Boolean).join(" · ")}
                            </div>
                          ) : null}
                        </div>
                        <div style={styles.row}>
                          <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => handleApprovePendingProfile(pendingProfile)}>Hyväksy</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {allowedUsers.length === 0 ? <div style={styles.muted}>Ei vielä sallittuja käyttäjiä.</div> : (
                (() => {
                  const userSections = [
                    { title: "Ownerit", items: allowedUsers.filter((user) => user.role === "owner") },
                    { title: "Ostajakäyttäjät", items: allowedUsers.filter((user) => user.role === "buyer") },
                    { title: "Käyttäjät", items: allowedUsers.filter((user) => user.role !== "owner" && user.role !== "buyer") },
                  ];

                  return userSections.map((section) => (
                    section.items.length === 0 ? null : (
                      <div key={section.title} style={styles.stack}>
                        <div style={{ ...styles.card, ...styles.sectionCard, padding: "12px 16px", background: "#f8fafc" }}>
                          <strong>{section.title}</strong>
                        </div>
                        {section.items.map((user) => {
                          const linkedBuyer = buyers.find((buyer) => buyer.id === user.buyer_id);
                          return (
                            <div key={user.id} style={styles.entry}>
                              <div style={styles.entryHeader}>
                                <div>
                                  <div style={styles.entryBadges}>
                                    <span style={styles.badge}>{user.display_name}</span>
                                    <span style={styles.badge}>{user.email}</span>
                                    <span style={styles.badge}>{roleLabel(user.role)}</span>
                                    <span style={styles.badge}>{user.is_active ? "Aktiivinen" : "Pois käytöstä"}</span>
                                    {linkedBuyer ? <span style={styles.badge}>Ostaja: {linkedBuyer.company_name}</span> : null}
                                  </div>
                                </div>
                                <div style={styles.row}>
                                  <button style={styles.button} onClick={() => toggleAllowedUserActive(user)}>{user.is_active ? "Poista käytöstä" : "Aktivoi"}</button>
                                  <button
                                    style={{ ...styles.button, borderColor: "#fca5a5", color: "#b91c1c", background: "#fff1f2" }}
                                    onClick={() => deleteAllowedUser(user)}
                                  >
                                    Poista kokonaan
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )
                  ));
                })()
              )}
            </div>
          </div>
        ) : null}

        {labelPrintEntry ? (
          <CatchLabelPrintModal
            entry={labelPrintEntry}
            profile={profile}
            labelCount={labelPrintCount}
            setLabelCount={setLabelPrintCount}
            onClose={() => setLabelPrintEntry(null)}
            onGeneratePdf={() => openCatchLabelPrintDialog(labelPrintEntry, "pdf")}
            onPrint={() => openCatchLabelPrintDialog(labelPrintEntry, "print")}
          />
        ) : null}
      </div>
    </div>
  );
}
