import { describe, expect, it } from "vitest";
import {
  getFishingVesselValidationIssue,
  getOfficialCatchSaveBlocker,
} from "./catchValidationPolicy.js";

describe("virallisen saalisilmoituksen tallennusvaatimukset", () => {
  it.each([false, true])("estää puutteellisen sisävesisaaliin lisenssitilasta riippumatta (%s)", (fisherPremiumRequired) => {
    expect(getOfficialCatchSaveBlocker({
      fisherPremiumRequired,
      issues: ["Verkon solmuväli puuttuu."],
    })).toContain("Verkon solmuväli puuttuu.");
  });

  it("estää myös puutteellisen rannikkosaaliin", () => {
    expect(getOfficialCatchSaveBlocker({
      marineCatch: true,
      fisherPremiumRequired: true,
      issues: ["ICES-osa-alue puuttuu."],
    })).toContain("virallisen rannikkokalastusilmoituksen");
  });

  it("sallii tallennuksen, kun pakollisia tietoja ei puutu", () => {
    expect(getOfficialCatchSaveBlocker({
      fisherPremiumRequired: true,
      issues: [],
    })).toBe("");
  });
});

describe("kalastusaluksen valinta", () => {
  it("estää tallennuksen, jos alusta tai ilman alusta -valintaa ei ole annettu", () => {
    expect(getFishingVesselValidationIssue()).toBe(
      "Valitse kalastuksessa käytetty alus tai Kalastus ilman alusta."
    );
  });

  it("hyväksyy valitun kalastusaluksen", () => {
    expect(getFishingVesselValidationIssue({ selectedVesselId: " FIN-123 " })).toBe("");
  });

  it("hyväksyy kalastuksen ilman alusta", () => {
    expect(getFishingVesselValidationIssue({ fishingWithoutVessel: true })).toBe("");
  });
});
