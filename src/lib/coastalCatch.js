const COASTAL_LANDING_ONLY_SPECIES = new Set(["lohi", "turska"]);
const FYKE_GEAR_CODES = new Set(["FYK", "FPN", "FPO"]);

function normalizeSpecies(value) {
  return String(value || "")
    .split(",")[0]
    .trim()
    .toLocaleLowerCase("fi-FI");
}

function parseNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isCoastalReportSpeciesAllowed(species) {
  return !COASTAL_LANDING_ONLY_SPECIES.has(normalizeSpecies(species));
}

export function isMarineFykeGear(gearCode) {
  return FYKE_GEAR_CODES.has(String(gearCode || "").trim().toUpperCase());
}

export function getCoastalEffortValidationIssues({
  gearCount = "",
  fishingDays = "",
  fishingHours = "",
  marineGearCode = "",
} = {}) {
  const issues = [];
  const parsedGearCount = parseNumber(gearCount);
  const parsedFishingDays = parseNumber(fishingDays);
  const parsedFishingHours = parseNumber(fishingHours);

  if (!Number.isInteger(parsedGearCount) || parsedGearCount <= 0) {
    issues.push("Pyydysten lukumäärän pitää olla positiivinen kokonaisluku.");
  }
  if (parsedFishingDays == null || parsedFishingDays <= 0) {
    issues.push("Pyyntipäivien määrän pitää olla suurempi kuin nolla.");
  }
  if (String(fishingHours ?? "").trim()) {
    if (isMarineFykeGear(marineGearCode)) {
      issues.push("Kalastusaikaa ei ilmoiteta rysäkalastuksessa.");
    } else if (parsedFishingHours == null || parsedFishingHours <= 0) {
      issues.push("Kalastusajan pitää olla suurempi kuin nolla tuntia.");
    }
  }

  return issues;
}
