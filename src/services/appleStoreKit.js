import { Capacitor, registerPlugin } from "@capacitor/core";

export const APPLE_FISHER_PREMIUM_PRODUCT_ID = "fisher_premium_monthly";

const AppleStoreKit = registerPlugin("AppleStoreKit");

export function isAppleStoreKitAvailable() {
  return Capacitor.getPlatform() === "ios";
}

export async function isAppleStoreKitDebugBuild() {
  if (!isAppleStoreKitAvailable()) return false;
  const result = await AppleStoreKit.getBuildEnvironment();
  return result?.debug === true;
}

export async function getAppleFisherPremiumProduct() {
  if (!isAppleStoreKitAvailable()) return null;
  return AppleStoreKit.getSubscriptionProduct({
    productId: APPLE_FISHER_PREMIUM_PRODUCT_ID,
  });
}

export async function purchaseAppleFisherPremium(appAccountToken) {
  if (!isAppleStoreKitAvailable()) {
    throw new Error("App Store -tilauksen voi ostaa vain iPhone- tai iPad-sovelluksessa.");
  }
  return AppleStoreKit.purchaseSubscription({
    productId: APPLE_FISHER_PREMIUM_PRODUCT_ID,
    appAccountToken: String(appAccountToken || ""),
  });
}

export async function restoreAppleFisherPremiumPurchases({ synchronize = true } = {}) {
  if (!isAppleStoreKitAvailable()) return { purchases: [] };
  return AppleStoreKit.getActiveSubscriptions({ synchronize });
}

export function findAppleFisherPremiumPurchase(purchases = []) {
  return (purchases || []).find((purchase) => (
    purchase?.productId === APPLE_FISHER_PREMIUM_PRODUCT_ID
    && purchase?.signedTransactionInfo
  )) || null;
}

export async function finishAppleStoreKitTransaction(transactionId) {
  if (!isAppleStoreKitAvailable() || !transactionId) return { finished: false };
  return AppleStoreKit.finishTransaction({ transactionId: String(transactionId) });
}

export function getAppleFisherPremiumManagementUrl() {
  return "https://apps.apple.com/account/subscriptions";
}
