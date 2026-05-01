import { describe, expect, it } from "vitest";

import { applyGrossPriceInput, createSpeciesRow } from "./helpers.js";

describe("helpers", () => {
  describe("applyGrossPriceInput", () => {
    it("converts VAT-inclusive price input into stored net price", () => {
      const row = createSpeciesRow();
      const nextRow = applyGrossPriceInput(row, "7,5", {
        parseLocaleNumber: (value) => Number(String(value).replace(",", ".")),
        calculateNetPrice: (value) => value / 1.135,
      });

      expect(nextRow.price_per_kg_gross_input).toBe("7,5");
      expect(nextRow.price_per_kg).toBe("6,6079");
    });

    it("clears both gross input and net price when gross field is emptied", () => {
      const row = {
        ...createSpeciesRow(),
        price_per_kg: "6,6079",
        price_per_kg_gross_input: "7,5",
      };

      const nextRow = applyGrossPriceInput(row, "", {
        parseLocaleNumber: (value) => Number(String(value).replace(",", ".")),
        calculateNetPrice: (value) => value / 1.135,
      });

      expect(nextRow.price_per_kg_gross_input).toBe("");
      expect(nextRow.price_per_kg).toBe("");
    });
  });
});
