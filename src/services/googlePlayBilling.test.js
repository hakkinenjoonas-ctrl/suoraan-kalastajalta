import { describe, expect, it } from "vitest";
import {
  FISHER_PREMIUM_PRODUCT_ID,
  findFisherPremiumPurchase,
} from "./googlePlayBilling.js";

describe("findFisherPremiumPurchase", () => {
  it("finds Premium among Google Play purchases", () => {
    const premium = {
      purchaseToken: "premium-token",
      products: [FISHER_PREMIUM_PRODUCT_ID],
    };

    expect(findFisherPremiumPurchase([
      { purchaseToken: "other-token", products: ["other_product"] },
      premium,
    ])).toBe(premium);
  });

  it("returns null when Premium is not active", () => {
    expect(findFisherPremiumPurchase([
      { purchaseToken: "other-token", products: ["other_product"] },
    ])).toBeNull();
    expect(findFisherPremiumPurchase()).toBeNull();
  });
});
