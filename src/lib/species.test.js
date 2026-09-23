import { describe, expect, it } from "vitest";
import { fishSpeciesCatalog, fishSpeciesVariants } from "./constants.js";
import {
  formatSpeciesForCatchLabel,
  formatSpeciesForLabelTitle,
  formatSpeciesForSale,
  getCrayfishSizeLabel,
  getSpeciesMetadata,
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
    expect(getCrayfishSizeLabel("Täplärapu 10+ cm")).toBe("10+ cm");
    expect(getCrayfishSizeLabel("Jokirapu 10–12 cm")).toBe("10–12 cm");
    expect(getCrayfishSizeLabel("Kuha 40 cm")).toBe("");
  });

  it("uses the catalog species as the label title", () => {
    expect(formatSpeciesForLabelTitle("Kuha, filee")).toBe("Kuha");
    expect(formatSpeciesForLabelTitle("Täplärapu 10–12 cm")).toBe("Täplärapu");
    expect(getSpeciesMetadata("Jokirapu 12+ cm")?.scientific).toBe("Astacus astacus");
  });

  it("keeps the crayfish size class in the catch-label product name", () => {
    expect(formatSpeciesForCatchLabel("Täplärapu 12+ cm")).toBe("Täplärapu 12+ cm");
    expect(formatSpeciesForCatchLabel("Jokirapu 10–12 cm")).toBe("Jokirapu 10–12 cm");
    expect(formatSpeciesForCatchLabel("Kuha, filee", "Perattu")).toBe("Kuha, perattu");
  });

  it("resolves metadata and scientific names for every supported species and variant", () => {
    fishSpeciesCatalog.forEach((species) => {
      expect(getSpeciesMetadata(species.name_fi)?.scientific).toBe(species.scientific);
    });
    fishSpeciesVariants.forEach((variant) => {
      expect(getSpeciesMetadata(variant)?.scientific, variant).toBeTruthy();
    });
  });
});
