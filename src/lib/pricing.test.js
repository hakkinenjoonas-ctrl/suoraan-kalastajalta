import { describe, expect, it } from "vitest";

import {
  FISH_VAT_RATE,
  calculateGrossPrice,
  calculateNetPrice,
  calculateOfferCommissionValues,
  formatDeliveredPricePerKg,
  formatDeliveryPrice,
  formatVatPercent,
} from "./pricing.js";

describe("pricing", () => {
  it("calculates gross price from net price", () => {
    expect(calculateGrossPrice(10)).toBe(11.35);
  });

  it("calculates net price from gross price", () => {
    expect(Number(calculateNetPrice(11.35)?.toFixed(2))).toBe(10);
  });

  it("formats configured VAT percent for UI", () => {
    expect(formatVatPercent(FISH_VAT_RATE)).toBe("13,5");
  });

  it("formats delivery prices", () => {
    expect(formatDeliveryPrice(12)).toBe("12 €");
    expect(formatDeliveredPricePerKg(5.5)).toBe("5,5 €/kg");
  });

  it("calculates commission values from line-item trade value", () => {
    expect(calculateOfferCommissionValues({
      reservedKilos: 10,
      counterPricePerKg: 6,
      lineItemTradeValue: 80,
      summaryTradeValue: 60,
      commissionRate: 0.03,
    })).toEqual({
      billingKilos: 10,
      billingPricePerKg: 6,
      tradeValue: 80,
      commissionValue: 2.4,
    });
  });
});
