import { describe, expect, it } from "vitest";
import {
  createInlandGearPreset,
  formatInlandGearPresetLabel,
  getInlandGearCode,
  getInlandGearValidationIssues,
  isInlandDualQuantitySpecies,
  saveInlandGearPreset,
} from "./inlandCatch.js";

describe("vuoden 2025 sisävesipyydykset", () => {
  it("käyttää uusia koodeja", () => {
    expect(getInlandGearCode("Paritrooli")).toBe("19");
    expect(getInlandGearCode("Nuotta")).toBe("20");
    expect(getInlandGearCode("Verkko")).toBe("21");
    expect(getInlandGearCode("Rysä")).toBe("22");
    expect(getInlandGearCode("Paunetti / avorysä")).toBe("23");
  });

  it("vaatii nuotalta määrän 1, pyyntiajan, vedon pituuden ja tekniset tiedot", () => {
    expect(getInlandGearValidationIssues({ gear: "Nuotta", gearCount: "2" })).toEqual(expect.arrayContaining([
      "Nuotta-pyydyksen määrän pitää olla 1.",
      "Pyyntiaika puuttuu.",
      "Vedon pituus puuttuu.",
      "Solmuväli puuttuu.",
      "Korkeus puuttuu.",
      "Leveys puuttuu.",
    ]));
  });

  it.each(["Jokirapu", "Täplärapu 10+ cm", "Nahkiainen", "Lohi"])("vaatii kilot ja kappaleet lajille %s", (species) => {
    expect(isInlandDualQuantitySpecies(species)).toBe(true);
  });

  it("muodostaa verkon teknisistä tiedoista uudelleenkäytettävän pyydysvalinnan", () => {
    const preset = createInlandGearPreset({
      gear: "Verkko",
      netMeshSize: "55.0",
      netHeight: "5",
      gearLength: "30",
    });

    expect(preset).toMatchObject({
      gearCode: "21",
      gearName: "Verkko",
      netMeshSize: "55",
      netHeight: "5",
      gearLength: "30",
    });
    expect(formatInlandGearPresetLabel(preset)).toBe("Verkko (55 mm, 5 m, 30 m)");
  });

  it("hyväksyy suomalaisen desimaalipilkun pyydyksen teknisissä tiedoissa", () => {
    expect(getInlandGearValidationIssues({
      gear: "Rysä",
      gearCount: "2",
      fishingDurationDays: "3",
      netMeshSize: "30",
      netHeight: "3,5",
      gearLength: "100",
    })).toEqual([]);
  });

  it("ei tallenna keskeneräistä pyydystä ja siirtää uudelleen käytetyn pyydyksen listan alkuun", () => {
    expect(createInlandGearPreset({ gear: "Verkko", netMeshSize: "55", netHeight: "5" })).toBeNull();

    const first = saveInlandGearPreset([], { gear: "Verkko", netMeshSize: "45", netHeight: "3", gearLength: "30" });
    const second = saveInlandGearPreset(first, { gear: "Verkko", netMeshSize: "55", netHeight: "5", gearLength: "30" });
    const reused = saveInlandGearPreset(second, { gear: "Verkko", netMeshSize: "45.0", netHeight: "3", gearLength: "30" });

    expect(reused).toHaveLength(2);
    expect(formatInlandGearPresetLabel(reused[0])).toBe("Verkko (45 mm, 3 m, 30 m)");
  });
});
