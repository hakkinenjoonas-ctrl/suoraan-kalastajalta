import { describe, expect, it } from "vitest";
import {
  formatSpeciesForLabelTitle,
  formatSpeciesForSale,
  getSpeciesPriceUnit,
  getSpeciesRowLabel,
  isCrayfishSpecies,
} from "./species.js";

describe("species helpers", () => {
  it("preserves custom species rows", () => {
    expect(getSpeciesRowLabel({ species: "Muu", customSpecies: "  Särmäneula " })).toBe("Särmäneula");
    expect(getSpeciesRowLabel({ species: "Kuha" })).toBe("Kuha");
  });

  it("normalizes catalog species while preserving product suffixes", () => {
    expect(formatSpeciesForSale("kuha, filee")).toBe("Kuha, filee");
    expect(formatSpeciesForSale("  kuha   perattu ")).toBe("Kuha perattu");
  });

  it("recognizes crayfish and their unit", () => {
    expect(isCrayfishSpecies("Täplärapu")).toBe(true);
    expect(isCrayfishSpecies("Kuha")).toBe(false);
    expect(getSpeciesPriceUnit("Jokirapu")).toBe("kpl");
    expect(getSpeciesPriceUnit("Ahven")).toBe("kg");
  });

  it("uses the catalog species as the label title", () => {
    expect(formatSpeciesForLabelTitle("Kuha, filee")).toBe("Kuha");
  });
});
