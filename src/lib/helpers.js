export function safeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createSpeciesRow() {
  return { id: safeId(), species: "", customSpecies: "", kilos: "", count: "", price_per_kg: "", price_per_kg_gross_input: "" };
}

export function applyGrossPriceInput(row, value, { parseLocaleNumber, calculateNetPrice }) {
  if (value === "") {
    return {
      ...row,
      price_per_kg_gross_input: "",
      price_per_kg: "",
    };
  }

  const parsedGross = parseLocaleNumber(value);
  const parsedNet = parsedGross == null ? null : calculateNetPrice(parsedGross);
  return {
    ...row,
    price_per_kg_gross_input: value,
    price_per_kg: parsedNet == null ? row.price_per_kg : parsedNet.toLocaleString("fi-FI", { maximumFractionDigits: 4 }),
  };
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}
