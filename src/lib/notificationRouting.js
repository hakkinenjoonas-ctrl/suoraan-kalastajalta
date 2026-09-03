export function parseNotificationPayloadPart(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function normalizeNotificationNavigationPayload(payload = {}) {
  const root = parseNotificationPayloadPart(payload);
  const nestedData = parseNotificationPayloadPart(root.data);
  const nestedExtra = parseNotificationPayloadPart(root.extra);
  return { ...root, ...nestedData, ...nestedExtra };
}

export function getNotificationRouteTarget(data, role = "") {
  const normalizedData = normalizeNotificationNavigationPayload(data);
  const route = String(normalizedData?.route || "");
  const eventType = String(normalizedData?.eventType || normalizedData?.event_type || "").toLowerCase();
  const notificationText = `${String(normalizedData?.title || "")} ${String(normalizedData?.body || "")}`.toLocaleLowerCase("fi-FI");
  if (route === "consumer_marketplace" || (role === "consumer" && eventType === "consumer_listing_published")) return "consumer_marketplace";
  if (route === "billing") return role === "buyer" ? "buyer_billing" : "billing";
  if (route === "auctions") return "auctions";
  if (route === "offers") return "offers";
  if (eventType.startsWith("auction_")) return "auctions";
  if (notificationText.includes("huutokauppa")) return "auctions";
  return "dashboard";
}
