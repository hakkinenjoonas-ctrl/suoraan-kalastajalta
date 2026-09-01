import { fishSpeciesByName, fishSpeciesCatalog } from "./constants.js";

export function getSpeciesRowLabel(row) {
  if (row?.species === "Muu") {
    return String(row?.customSpecies || "").trim() || "Muu";
  }
  return row?.species || "";
}

export function getSpeciesMetadata(label) {
  const normalized = String(label || "")
    .split(",")[0]
    .replace(/\b(filee|filet|avattu|perattu|päätön|nyljetty)\b/gi, "")
    .replace(/\b\d+\+\s*cm\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return fishSpeciesByName[normalized] || null;
}

export function isCrayfishSpecies(label) {
  const metadata = getSpeciesMetadata(label);
  if (metadata?.scientific === "Pacifastacus leniusculus" || metadata?.scientific === "Astacus astacus") return true;
  const normalized = String(label || "").toLowerCase();
  return normalized.includes("täplärapu") ||
    normalized.includes("jokirapu") ||
    normalized.includes("pacifastacus leniusculus") ||
    normalized.includes("astacus astacus");
}

export function getSpeciesPriceUnit(label) {
  return isCrayfishSpecies(label) ? "kpl" : "kg";
}

export function normalizeSpeciesDisplayLabel(label) {
  const raw = String(label || "").trim();
  if (!raw) return "Muu";

  const collapsed = raw.replace(/\s+/g, " ").trim();
  const lowerCollapsed = collapsed.toLowerCase();
  const sortedSpecies = [...fishSpeciesCatalog]
    .map((item) => item.name_fi)
    .sort((left, right) => right.length - left.length);

  const matchedSpecies = sortedSpecies.find((speciesName) => {
    const lowerSpecies = speciesName.toLowerCase();
    return lowerCollapsed === lowerSpecies || lowerCollapsed.startsWith(`${lowerSpecies} `) || lowerCollapsed.startsWith(`${lowerSpecies},`);
  });

  if (!matchedSpecies) return collapsed;

  const suffix = collapsed.slice(matchedSpecies.length).trim();
  if (!suffix) return matchedSpecies;

  if (suffix.startsWith(",")) {
    return `${matchedSpecies}${suffix}`;
  }

  return `${matchedSpecies} ${suffix}`;
}

export function formatSpeciesForSale(label) {
  return normalizeSpeciesDisplayLabel(label);
}

export function formatSpeciesForLabelTitle(label) {
  const normalized = normalizeSpeciesDisplayLabel(label);
  if (!normalized) return "Muu";

  const metadata = getSpeciesMetadata(normalized);
  return metadata?.name_fi || normalized;
}
