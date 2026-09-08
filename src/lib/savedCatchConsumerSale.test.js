import { describe, expect, it } from "vitest";
import { calculateSavedCatchConsumerAllocation, getSavedCatchUnallocatedKilos } from "./savedCatchConsumerSale.js";

describe("saved catch consumer allocation", () => {
  it("allows only part of a catch to be allocated across several package sizes", () => {
    const allocation = calculateSavedCatchConsumerAllocation("package", [
      { packageSizeKg: "1", availableUnits: "20" },
      { packageSizeKg: "0,5", availableUnits: "20" },
    ]);
    expect(allocation).toEqual({ minimum: 30, maximum: 30 });
    expect(getSavedCatchUnallocatedKilos(100, allocation)).toBe(70);
  });

  it("calculates the minimum and maximum allocation for whole fish", () => {
    const allocation = calculateSavedCatchConsumerAllocation("whole_fish", [
      { minWeightKg: "1,2", maxWeightKg: "1,5", availableUnits: "8" },
    ]);
    expect(allocation.minimum).toBeCloseTo(9.6);
    expect(allocation.maximum).toBe(12);
  });
});
