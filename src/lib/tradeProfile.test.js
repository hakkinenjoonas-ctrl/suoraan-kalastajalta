import { describe, expect, it } from "vitest";
import {
  getMissingBuyerPurchaseFields,
  getMissingSellerSaleFields,
} from "./tradeProfile.js";

describe("trade profile validation", () => {
  it("does not require seller billing recipient details for selling", () => {
    const profile = {
      company_name: "Kalastaja Oy",
      business_id: "1234567-8",
      display_name: "Kalle Kalastaja",
      phone: "040 123 4567",
      contact_email: "kalle@example.fi",
      address: "Rantatie 1",
      postcode: "00100",
      city: "Helsinki",
      commercial_fishing_id: "FIN123",
    };

    expect(getMissingSellerSaleFields(profile)).toEqual([]);
  });

  it("reports missing seller contact details", () => {
    expect(getMissingSellerSaleFields({ company_name: "Kalastaja Oy" })).toContain("puhelinnumero");
    expect(getMissingSellerSaleFields({ company_name: "Kalastaja Oy" })).toContain("kaupallisen kalastajan tunnus");
  });

  it("requires buyer billing details before purchasing", () => {
    const missing = getMissingBuyerPurchaseFields({
      company_name: "Ravintola Oy",
      business_id: "2345678-9",
      contact_name: "Oona Ostaja",
      email: "oona@example.fi",
      phone: "050 123 4567",
      delivery_address: "Kauppakatu 2",
      delivery_postcode: "00200",
      delivery_city: "Helsinki",
    });

    expect(missing).toEqual([
      "laskutusosoite",
      "laskutuksen postinumero",
      "laskutuskaupunki",
      "laskutussähköposti",
    ]);
  });
});
