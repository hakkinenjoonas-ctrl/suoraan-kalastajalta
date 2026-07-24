import { describe, expect, it } from "vitest";
import {
  FISH_PACKAGING_OPTIONS,
  extractPackagingFromNotes,
  removePackagingFromNotes,
} from "./packaging.js";

describe("fish packaging", () => {
  it("contains the requested box and container sizes", () => {
    expect(FISH_PACKAGING_OPTIONS).toContain("EPS-kalalaatikko (styrox), 5 kg");
    expect(FISH_PACKAGING_OPTIONS).toContain("Vedenpitävä aaltopahvinen kalalaatikko, 20 kg");
    expect(FISH_PACKAGING_OPTIONS).toContain("Muovinen kalapakki, 600 l");
  });

  it("extracts packaging without mixing it into additional notes", () => {
    const notes = "Keskipaino 1,5 kg\nPakkaustapa: Vedenpitävä aaltopahvinen kalalaatikko, 10 kg";
    expect(extractPackagingFromNotes(notes)).toBe("Vedenpitävä aaltopahvinen kalalaatikko, 10 kg");
    expect(removePackagingFromNotes(notes)).toBe("Keskipaino 1,5 kg");
  });
});
