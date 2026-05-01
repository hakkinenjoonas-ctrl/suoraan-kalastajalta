export const FISH_VAT_RATE = 0.135;

export function calculateGrossPrice(value, vatRate = FISH_VAT_RATE) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return number * (1 + vatRate);
}

export function calculateNetPrice(value, vatRate = FISH_VAT_RATE) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return number / (1 + vatRate);
}

export function formatVatPercent(vatRate = FISH_VAT_RATE) {
  return (vatRate * 100).toLocaleString("fi-FI", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function formatDeliveryPrice(value) {
  if (value === null || value === undefined || value === "") return "-";
  const number = Number(value);
  if (Number.isNaN(number)) return String(value || "-");
  return `${number.toLocaleString("fi-FI")} €`;
}

export function formatDeliveredPricePerKg(value) {
  if (value === null || value === undefined || value === "") return "-";
  const number = Number(value);
  if (Number.isNaN(number)) return String(value || "-");
  return `${number.toLocaleString("fi-FI")} €/kg`;
}

export function calculateOfferCommissionValues({
  reservedKilos,
  totalKilos,
  counterPricePerKg,
  pricePerKg,
  offerPricePerKg,
  lineItemTradeValue = 0,
  summaryTradeValue = 0,
  commissionRate = 0.03,
}) {
  const billingKilos = Number(reservedKilos || totalKilos || 0);
  const billingPricePerKg = Number(counterPricePerKg || pricePerKg || offerPricePerKg || 0);
  const directTradeValue = billingKilos * billingPricePerKg;
  const tradeValue = lineItemTradeValue > 0
    ? lineItemTradeValue
    : directTradeValue > 0
      ? directTradeValue
      : summaryTradeValue;
  const commissionValue = tradeValue * commissionRate;

  return {
    billingKilos,
    billingPricePerKg,
    tradeValue,
    commissionValue,
  };
}
