export const CONSUMER_SALES_TAB = "consumer_sales";
export const WHOLESALE_SALES_TAB = "offers";

export function getSellerSalesTabs(role) {
  if (role === "buyer") return [WHOLESALE_SALES_TAB];
  if (role === "member" || role === "owner") return [CONSUMER_SALES_TAB, WHOLESALE_SALES_TAB];
  return [WHOLESALE_SALES_TAB];
}

export function getSalesTabLabel(tabId, role) {
  if (tabId === CONSUMER_SALES_TAB) return "Kuluttajamyynti";
  if (tabId === WHOLESALE_SALES_TAB) return role === "buyer" ? "Tarjoukset" : "Tukkumyynti";
  return "";
}
