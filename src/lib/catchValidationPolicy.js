export function getOfficialCatchSaveBlocker({
  marineCatch = false,
  issues = [],
  fisherPremiumRequired = false,
} = {}) {
  // Viranomaisraportoinnin pakollisuus ei riipu kalastajalisenssistä.
  void fisherPremiumRequired;

  const normalizedIssues = Array.isArray(issues) ? issues.filter(Boolean) : [];
  if (normalizedIssues.length === 0) return "";

  return `Täytä virallisen ${marineCatch ? "rannikkokalastusilmoituksen" : "saalisilmoituksen"} tiedot ennen tallennusta: ${normalizedIssues.join(" ")}`;
}

export function getFishingVesselValidationIssue({
  fishingWithoutVessel = false,
  selectedVesselId = "",
} = {}) {
  if (fishingWithoutVessel || String(selectedVesselId || "").trim()) return "";
  return "Valitse kalastuksessa käytetty alus tai Kalastus ilman alusta.";
}
