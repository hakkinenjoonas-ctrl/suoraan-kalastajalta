export function safeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createSpeciesRow() {
  return { id: safeId(), species: "", customSpecies: "", kilos: "", count: "", price_per_kg: "", price_per_kg_gross_input: "" };
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}
