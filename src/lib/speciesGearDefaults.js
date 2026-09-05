function normalizeLookupValue(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("fi-FI");
}

function isNetGear(value) {
  const normalized = normalizeLookupValue(value);
  return normalized === "muikkuverkko" || normalized === "verkko" || normalized.startsWith("verkko,");
}

export function findLatestSpeciesNetMeshSize(entries, species, ownerUserId = "") {
  const speciesKey = normalizeLookupValue(species);
  const ownerKey = String(ownerUserId || "").trim();
  if (!speciesKey) return "";

  const match = (Array.isArray(entries) ? entries : []).find((entry) => {
    if (ownerKey && String(entry?.ownerUserId || entry?.owner_user_id || "").trim() !== ownerKey) return false;
    if (normalizeLookupValue(entry?.species) !== speciesKey) return false;
    if (!isNetGear(entry?.gear || entry?.marineGearName || entry?.marine_gear_name)) return false;
    return Boolean(String(entry?.netMeshSize || entry?.gear_mesh_size || "").trim());
  });

  return String(match?.netMeshSize || match?.gear_mesh_size || "").trim();
}
