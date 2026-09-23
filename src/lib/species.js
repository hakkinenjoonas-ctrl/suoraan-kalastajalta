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
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:\+|[-–—]\s*\d+(?:[.,]\d+)?)?\s*cm\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return fishSpeciesByName[normalized] || null;
}

export function getCrayfishSizeLabel(label) {
  if (!isCrayfishSpecies(label)) return "";
  const match = String(label || "").match(/\b\d+(?:[.,]\d+)?\s*(?:\+|[-–—]\s*\d+(?:[.,]\d+)?)?\s*cm\b/i);
  return match ? match[0].replace(/\s+/g, " ").trim() : "";
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

export function formatSpeciesForCatchLabel(label, productForm = "") {
  const normalized = formatSpeciesForSale(label);
  if (!normalized) return "Muu";

  // The size class is part of the crayfish product name (for example
  // "Täplärapu 12+ cm"), so it must not be reduced to the catalog species.
  if (isCrayfishSpecies(normalized)) return normalized;

  const metadata = getSpeciesMetadata(normalized);
  const baseSpecies = String(metadata?.name_fi || normalized.split(",")[0] || normalized).trim();
  const selectedProductForm = String(productForm || "").trim();
  return selectedProductForm
    ? `${baseSpecies}, ${selectedProductForm.toLocaleLowerCase("fi-FI")}`
    : baseSpecies;
}
