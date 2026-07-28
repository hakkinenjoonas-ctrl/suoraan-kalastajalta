import { Capacitor, registerPlugin } from "@capacitor/core";

export const FISHER_PREMIUM_PRODUCT_ID = "fisher_premium_monthly";
export const GOOGLE_PLAY_PACKAGE_ID = "fi.suoraankalastajalta.app";

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

export function findFisherPremiumPurchase(purchases = []) {
  return (purchases || []).find((purchase) => (
    (purchase?.products || []).includes(FISHER_PREMIUM_PRODUCT_ID)
  )) || null;
}

export function getFisherPremiumManagementUrl() {
  const parameters = new URLSearchParams({
    sku: FISHER_PREMIUM_PRODUCT_ID,
    package: GOOGLE_PLAY_PACKAGE_ID,
  });
  return `https://play.google.com/store/account/subscriptions?${parameters.toString()}`;
}
