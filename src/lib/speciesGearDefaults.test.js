import { describe, expect, it } from "vitest";
import { findLatestSpeciesNetMeshSize } from "./speciesGearDefaults.js";

describe("findLatestSpeciesNetMeshSize", () => {
  const entries = [
    { species: "Muikku", gear: "Muikkuverkko", netMeshSize: "17", ownerUserId: "fisher-1" },
    { species: "Kuha", gear: "Verkko", netMeshSize: "55", ownerUserId: "fisher-1" },
    { species: "Kuha", gear: "Verkko", netMeshSize: "60", ownerUserId: "fisher-2" },
  ];

  it("returns the latest net mesh size for the selected species and fisher", () => {
    expect(findLatestSpeciesNetMeshSize(entries, "kuha", "fisher-1")).toBe("55");
  });

  it("does not reuse another species or fisher's mesh size", () => {
    expect(findLatestSpeciesNetMeshSize(entries, "Ahven", "fisher-1")).toBe("");
    expect(findLatestSpeciesNetMeshSize(entries, "Kuha", "fisher-3")).toBe("");
  });
});
