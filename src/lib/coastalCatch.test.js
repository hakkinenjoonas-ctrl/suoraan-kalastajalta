import { describe, expect, it } from "vitest";
import {
  getCoastalEffortValidationIssues,
  isCoastalReportSpeciesAllowed,
  isMarineFykeGear,
} from "./coastalCatch.js";

describe("coastal catch reporting", () => {
  it("routes salmon and cod to a landing declaration", () => {
    expect(isCoastalReportSpeciesAllowed("Lohi")).toBe(false);
    expect(isCoastalReportSpeciesAllowed("Turska")).toBe(false);
    expect(isCoastalReportSpeciesAllowed("Silakka")).toBe(true);
  });

  it("requires gear count and fishing days", () => {
    expect(getCoastalEffortValidationIssues({ gearCount: "", fishingDays: "" })).toEqual([
      "Pyydysten lukumäärän pitää olla positiivinen kokonaisluku.",
      "Pyyntipäivien määrän pitää olla suurempi kuin nolla.",
    ]);
    expect(getCoastalEffortValidationIssues({ gearCount: "12", fishingDays: "2,5" })).toEqual([]);
  });

  it("does not accept fishing hours for fyke fishing", () => {
    expect(isMarineFykeGear("FYK")).toBe(true);
    expect(getCoastalEffortValidationIssues({
      gearCount: "1",
      fishingDays: "3",
      fishingHours: "12",
      marineGearCode: "FYK",
    })).toContain("Kalastusaikaa ei ilmoiteta rysäkalastuksessa.");
  });
});
