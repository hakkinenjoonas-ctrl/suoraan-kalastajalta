import { Capacitor, registerPlugin } from "@capacitor/core";

export const FISHER_PREMIUM_PRODUCT_ID = "fisher_premium_monthly";

const GooglePlayBilling = registerPlugin("GooglePlayBilling");

export function isGooglePlayBillingAvailable() {
  return Capacitor.getPlatform() === "android";
}

export async function getFisherPremiumProduct() {
  if (!isGooglePlayBillingAvailable()) return null;
  return GooglePlayBilling.getSubscriptionProduct({ productId: FISHER_PREMIUM_PRODUCT_ID });
}

export async function purchaseFisherPremium(offerToken) {
  if (!isGooglePlayBillingAvailable()) {
    throw new Error("Google Play -tilauksen voi ostaa vain Android-sovelluksessa.");
  }
  return GooglePlayBilling.purchaseSubscription({
    productId: FISHER_PREMIUM_PRODUCT_ID,
    offerToken: String(offerToken || ""),
  });
}

export async function restoreFisherPremiumPurchases() {
  if (!isGooglePlayBillingAvailable()) return { purchases: [] };
  return GooglePlayBilling.getActiveSubscriptions();
}

