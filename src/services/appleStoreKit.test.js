import { describe, expect, it } from "vitest";
import {
  APPLE_FISHER_PREMIUM_PRODUCT_ID,
  findAppleFisherPremiumPurchase,
  getAppleFisherPremiumManagementUrl,
} from "./appleStoreKit.js";

describe("Apple StoreKit billing helpers", () => {
  it("finds a signed Fisher Premium transaction", () => {
    const premium = {
      productId: APPLE_FISHER_PREMIUM_PRODUCT_ID,
      signedTransactionInfo: "header.payload.signature",
    };
    expect(findAppleFisherPremiumPurchase([
      { productId: "another_product", signedTransactionInfo: "other" },
      premium,
    ])).toBe(premium);
  });

  it("ignores unsigned or unrelated transactions", () => {
    expect(findAppleFisherPremiumPurchase([
      { productId: APPLE_FISHER_PREMIUM_PRODUCT_ID },
      { productId: "another_product", signedTransactionInfo: "other" },
    ])).toBeNull();
  });

  it("uses Apple's subscription management page", () => {
    expect(getAppleFisherPremiumManagementUrl()).toBe("https://apps.apple.com/account/subscriptions");
  });
});
