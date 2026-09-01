export const INLAND_GEAR_CATALOG = [
  { code: "1", name: "Trooli", fixedCount: 1, effort: "time", secondaryField: "speed", technicalFields: ["mesh", "height", "width"] },
  { code: "11", name: "Katiska", effort: "days", technicalFields: [] },
  { code: "12", name: "Merrat", effort: "days", technicalFields: [] },
  { code: "13", name: "Muu pyydys", effort: "days", technicalFields: ["mesh", "height", "length"], requiresOtherName: true },
  { code: "18", name: "Vapapyydys tai vetouistin", effort: "time", technicalFields: [] },
  { code: "19", name: "Paritrooli", fixedCount: 1, effort: "time", secondaryField: "speed", technicalFields: ["mesh", "height", "width"] },
  { code: "20", name: "Nuotta", fixedCount: 1, effort: "time", secondaryField: "haulLength", technicalFields: ["mesh", "height", "width"] },
  { code: "21", name: "Verkko", effort: "days", technicalFields: ["mesh", "height", "length"] },
  { code: "22", name: "Rysä", effort: "days", technicalFields: ["mesh", "height", "length"] },
  { code: "23", name: "Paunetti / avorysä", effort: "days", technicalFields: ["mesh", "height", "length"] },
];

export const INLAND_GEAR_NAMES = INLAND_GEAR_CATALOG.map((gear) => gear.name);

const LEGACY_INLAND_GEAR_ALIASES = new Map([
  ["Merta", "12"],
  ["Nuotta, korkeus yli 10 m", "20"],
  ["Nuotta, korkeus alle 10 m", "20"],
  ["Muikkuverkko", "21"],
  ["Verkko, solmuväli alle 25 mm", "21"],
  ["Verkko, solmuväli 25 - 40 mm", "21"],
  ["Verkko, solmuväli 41 - 54 mm", "21"],
  ["Verkko, solmuväli yli 54 mm", "21"],
  ["Rysä / paunetti, korkeus yli 1,5 m", "22"],
  ["Rysä / paunetti, korkeus alle 1,5 m", "22"],
  ["Hoitokalastus troolilla", "1"],
  ["Hoitokalastus nuotalla", "20"],
  ["Hoitokalastus rysällä, paunetilla, merralla ja katiskalla", "22"],
  ["Hoitokalastus muulla pyydyksellä", "13"],
]);

export function getInlandGearMeta(value) {
  const normalized = String(value || "").trim();
  const aliasCode = LEGACY_INLAND_GEAR_ALIASES.get(normalized);
  return INLAND_GEAR_CATALOG.find((gear) => gear.code === normalized || gear.code === aliasCode || gear.name === normalized) || null;
}

export function getInlandGearCode(value) {
  return getInlandGearMeta(value)?.code || "";
}

export function getInlandGearTechnicalFields(value) {
  return getInlandGearMeta(value)?.technicalFields || [];
}

const INLAND_GEAR_TECHNICAL_KEYS = {
  mesh: "netMeshSize",
  height: "netHeight",
  length: "gearLength",
  width: "gearWidth",
};

const INLAND_GEAR_TECHNICAL_UNITS = {
  mesh: "mm",
  height: "m",
  length: "m",
  width: "m",
};

function normalizeTechnicalNumber(value) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  const numericValue = Number(normalized);
  return Number.isFinite(numericValue) && numericValue > 0 ? String(numericValue) : "";
}

export function createInlandGearPreset(source = {}) {
  const gear = getInlandGearMeta(source.gearCode || source.inlandGearCode || source.gearName || source.gear);
  if (!gear || gear.technicalFields.length === 0) return null;

  const technicalValues = Object.fromEntries(
    gear.technicalFields.map((field) => [field, normalizeTechnicalNumber(source[INLAND_GEAR_TECHNICAL_KEYS[field]])]),
  );
  if (Object.values(technicalValues).some((value) => !value)) return null;

  const otherGearName = gear.requiresOtherName ? String(source.otherGearName || "").trim() : "";
  if (gear.requiresOtherName && !otherGearName) return null;

  const identityValues = gear.technicalFields.map((field) => technicalValues[field]);
  const id = [gear.code, ...identityValues, otherGearName.toLocaleLowerCase("fi-FI")]
    .map((value) => encodeURIComponent(value))
    .join(":");

  return {
    id,
    gearCode: gear.code,
    gearName: gear.name,
    netMeshSize: technicalValues.mesh || "",
    netHeight: technicalValues.height || "",
    gearLength: technicalValues.length || "",
    gearWidth: technicalValues.width || "",
    otherGearName,
  };
}

export function formatInlandGearPresetLabel(preset) {
  const gear = getInlandGearMeta(preset?.gearCode || preset?.gearName);
  if (!gear) return "";
  const details = gear.technicalFields
    .map((field) => {
      const value = normalizeTechnicalNumber(preset?.[INLAND_GEAR_TECHNICAL_KEYS[field]]);
      return value ? `${value.replace(".", ",")} ${INLAND_GEAR_TECHNICAL_UNITS[field]}` : "";
    })
    .filter(Boolean);
  const gearName = gear.requiresOtherName && preset?.otherGearName
    ? `${gear.name}: ${String(preset.otherGearName).trim()}`
    : gear.name;
  return details.length > 0 ? `${gearName} (${details.join(", ")})` : gearName;
}

export function normalizeInlandGearPresets(values) {
  if (!Array.isArray(values)) return [];
  const unique = new Map();
  values.forEach((value) => {
    const preset = createInlandGearPreset(value);
    if (preset && !unique.has(preset.id)) unique.set(preset.id, preset);
  });
  return [...unique.values()];
}

export function saveInlandGearPreset(values, source, limit = 40) {
  const preset = createInlandGearPreset(source);
  if (!preset) return normalizeInlandGearPresets(values).slice(0, limit);
  return [preset, ...normalizeInlandGearPresets(values).filter((item) => item.id !== preset.id)].slice(0, limit);
}

export function isInlandDualQuantitySpecies(label) {
  const normalized = String(label || "")
    .split(",")[0]
    .replace(/\b\d+\+\s*cm\b/gi, "")
    .trim()
    .toLocaleLowerCase("fi-FI");
  return normalized === "jokirapu" || normalized === "täplärapu" || normalized === "nahkiainen" || normalized === "lohi";
}

export function getInlandGearValidationIssues(form = {}) {
  const issues = [];
  const meta = getInlandGearMeta(form.inlandGearCode || form.gear);
  if (!meta) {
    issues.push("Valitse voimassa oleva sisävesien pyydys.");
    return issues;
  }

  const gearCount = String(form.gearCount || "").trim();
  const gearCountNumber = Number(gearCount.replace(",", "."));
  if (!gearCount) {
    issues.push("Pyydysten määrä puuttuu.");
  } else if (!Number.isInteger(gearCountNumber) || gearCountNumber <= 0) {
    issues.push("Pyydysten määrän pitää olla positiivinen kokonaisluku.");
  } else if (meta.fixedCount === 1 && gearCountNumber !== 1) {
    issues.push(`${meta.name}-pyydyksen määrän pitää olla 1.`);
  }

  const fishingEffort = String(form.fishingDurationDays || "").trim();
  const fishingEffortNumber = Number(fishingEffort.replace(",", "."));
  if (!fishingEffort) {
    issues.push(meta.effort === "time" ? "Pyyntiaika puuttuu." : "Pyyntipäivät puuttuvat.");
  } else if (meta.effort === "days" && (!Number.isFinite(fishingEffortNumber) || fishingEffortNumber <= 0)) {
    issues.push("Pyyntipäivien pitää olla positiivinen luku.");
  } else if (meta.effort === "time" && !/^\d{1,3}:[0-5]\d$/.test(fishingEffort)) {
    issues.push("Pyyntiaika annetaan muodossa hh:mm.");
  }
  if (meta.secondaryField === "speed" && !String(form.fishingSecondaryValue || "").trim()) {
    issues.push("Vetonopeus puuttuu.");
  } else if (meta.secondaryField === "speed" && !normalizeTechnicalNumber(form.fishingSecondaryValue)) {
    issues.push("Vetonopeuden pitää olla positiivinen luku.");
  }
  if (meta.secondaryField === "haulLength" && !String(form.fishingSecondaryValue || "").trim()) {
    issues.push("Vedon pituus puuttuu.");
  } else if (meta.secondaryField === "haulLength" && !normalizeTechnicalNumber(form.fishingSecondaryValue)) {
    issues.push("Vedon pituuden pitää olla positiivinen luku.");
  }

  const technicalValues = {
    mesh: form.netMeshSize,
    height: form.netHeight,
    length: form.gearLength,
    width: form.gearWidth,
  };
  const technicalLabels = {
    mesh: "Solmuväli",
    height: "Korkeus",
    length: "Pituus",
    width: "Leveys",
  };
  meta.technicalFields.forEach((field) => {
    const value = String(technicalValues[field] || "").trim();
    if (!value) issues.push(`${technicalLabels[field]} puuttuu.`);
    else if (!normalizeTechnicalNumber(value)) issues.push(`${technicalLabels[field]} pitää olla positiivinen luku.`);
  });

  if (meta.requiresOtherName && !String(form.otherGearName || "").trim()) {
    issues.push("Kerro, mikä muu pyydys on kyseessä.");
  }
  return issues;
}
