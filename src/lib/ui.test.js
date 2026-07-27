import { describe, expect, it } from "vitest";
import { formatDeliveryDestinations, normalizeDestinationCities } from "./ui";

describe("toimituskaupunkien normalisointi", () => {
  it("säilyttää vain Suomen kunnat ja poistaa osoitteen osat", () => {
    expect(normalizeDestinationCities(["Rapukatu 1", "56350", "Taipalsaari", "Helsinki"])).toEqual([
      "Taipalsaari",
      "Helsinki",
    ]);
  });

  it("tunnistaa kuntien nimet kirjainkoosta riippumatta", () => {
    expect(normalizeDestinationCities("helsinki, LAPPEENRANTA, 00100")).toEqual([
      "Helsinki",
      "Lappeenranta",
    ]);
  });

  it("muotoilee vain hyväksytyt toimituskaupungit", () => {
    expect(formatDeliveryDestinations(["Satamakatu 1", "Kuopio"])).toBe("Kuopio");
  });

  it("hyväksyy vuoden 2026 kuntajaon ja muuntaa vanhan Kemiönsaaren nimen", () => {
    expect(normalizeDestinationCities(["Kempele", "Kerava", "Kimitoön"])).toEqual([
      "Kempele",
      "Kerava",
      "Kemiönsaari",
    ]);
  });
});
