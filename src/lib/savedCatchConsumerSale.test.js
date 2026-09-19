import { describe, expect, it } from "vitest";
import { calculateSavedCatchConsumerAllocation, getSavedCatchUnallocatedKilos } from "./savedCatchConsumerSale.js";

describe("saved catch consumer allocation", () => {
  it("allows only part of a catch to be allocated across several package sizes", () => {
    const allocation = calculateSavedCatchConsumerAllocation("package", [
      { packageSizeKg: "1", availableUnits: "10" },
      { packageSizeKg: "0,5", availableUnits: "20" },
    ]);
    expect(allocation).toEqual({ minimum: 20, maximum: 20, pieces: 0 });
    expect(getSavedCatchUnallocatedKilos(100, allocation)).toBe(80);
  });

  it("allocates crayfish size classes by pieces", () => {
    const allocation = calculateSavedCatchConsumerAllocation("piece", [
      { label: "12+ cm", availableUnits: "80" },
      { label: "11+ cm", availableUnits: "50" },
      { label: "10+ cm", availableUnits: "120" },
    ]);
    expect(allocation).toEqual({ minimum: 0, maximum: 0, pieces: 250 });
  });

  it("calculates the minimum and maximum allocation for whole fish", () => {
    const allocation = calculateSavedCatchConsumerAllocation("whole_fish", [
      { minWeightKg: "1,2", maxWeightKg: "1,5", availableUnits: "8" },
    ]);
    expect(allocation.minimum).toBeCloseTo(9.6);
    expect(allocation.maximum).toBe(12);
    expect(getSavedCatchUnallocatedKilos(100, allocation)).toBe(88);
  });
});
