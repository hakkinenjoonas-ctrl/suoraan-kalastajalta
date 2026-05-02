function safeString(value) {
  return String(value || "").trim();
}

function roundCurrency(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}

function toIsoMonth(value) {
  const raw = safeString(value);
  return raw ? raw.slice(0, 7) : "";
}

function toTimestamp(value) {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getEffectiveQuantityKg(offer) {
  const reserved = Number(offer?.reserved_kilos || 0);
  if (Number.isFinite(reserved) && reserved > 0) return reserved;

  const total = Number(offer?.total_kilos || 0);
  if (Number.isFinite(total) && total > 0) return total;

  return 0;
}

function getEffectiveUnitPrice(offer) {
  const counter = Number(offer?.counter_price_per_kg);
  if (Number.isFinite(counter) && counter > 0) return counter;

  const direct = Number(offer?.price_per_kg);
  if (Number.isFinite(direct) && direct > 0) return direct;

  return 0;
}

function getTradeValue(offer) {
  const direct = Number(offer?.trade_value);
  if (Number.isFinite(direct) && direct > 0) return roundCurrency(direct);
  return roundCurrency(getEffectiveQuantityKg(offer) * getEffectiveUnitPrice(offer));
}

function getDeliveryCost(offer) {
  const value = Number(offer?.delivery_cost);
  return Number.isFinite(value) && value > 0 ? roundCurrency(value) : 0;
}

function getPurchaseTimestamp(offer) {
  return safeString(offer?.updated_at) || safeString(offer?.created_at);
}

function getSpeciesHeadline(speciesSummary) {
  const firstLine = safeString(speciesSummary).split("\n").map((line) => line.trim()).filter(Boolean)[0] || "Kalaerä";
  return firstLine.replace(/:\s*\d+(?:[.,]\d+)?\s*(kg|kpl)(?:\s*\([^)]*\))?$/i, "").trim() || "Kalaerä";
}

function pushAggregate(map, key, initialValue, mutate) {
  const existing = map.get(key) || initialValue();
  mutate(existing);
  map.set(key, existing);
}

export function buildBuyerReport(rawOffers = [], buyer = {}) {
  const offers = (rawOffers || [])
    .filter((offer) => safeString(offer?.status) === "accepted")
    .map((offer) => {
      const quantityKg = getEffectiveQuantityKg(offer);
      const unitPrice = getEffectiveUnitPrice(offer);
      const tradeValueEur = getTradeValue(offer);
      const deliveryCostEur = getDeliveryCost(offer);
      const purchaseDate = getPurchaseTimestamp(offer);
      const totalValueEur = roundCurrency(tradeValueEur + deliveryCostEur);

      return {
        id: safeString(offer?.id),
        offerId: safeString(offer?.id),
        batchId: safeString(offer?.batch_id),
        purchaseDate,
        month: toIsoMonth(purchaseDate),
        speciesHeadline: getSpeciesHeadline(offer?.species_summary),
        speciesSummary: safeString(offer?.species_summary),
        quantityKg,
        unitPriceEur: unitPrice,
        tradeValueEur,
        deliveryCostEur,
        totalValueEur,
        sellerName: safeString(offer?.seller_name) || "Kalastaja",
        sellerUserId: safeString(offer?.seller_user_id),
        sellerEmail: safeString(offer?.seller_contact_email || offer?.seller_email),
        area: safeString(offer?.area),
        spot: safeString(offer?.spot),
        deliveryMethod: safeString(offer?.delivery_method) || "Nouto",
        earliestDeliveryDate: safeString(offer?.earliest_delivery_date),
        fulfillmentStatus: safeString(offer?.fulfillment_status) || "awaiting_contact",
        billingStatus: safeString(offer?.billing_status) || "unbilled",
        buyerDeliveryCity: safeString(offer?.buyer_delivery_city || offer?.delivery_destination_city),
        buyerDeliveryAddress: safeString(offer?.buyer_delivery_address),
        buyerBillingEmail: safeString(offer?.buyer_billing_email),
        createdAt: safeString(offer?.created_at),
        updatedAt: safeString(offer?.updated_at),
      };
    })
    .sort((left, right) => toTimestamp(right.purchaseDate) - toTimestamp(left.purchaseDate));

  const speciesMap = new Map();
  const sellerMap = new Map();
  const monthlyMap = new Map();

  let totalQuantityKg = 0;
  let totalTradeValueEur = 0;
  let totalDeliveryCostEur = 0;

  offers.forEach((offer) => {
    totalQuantityKg += offer.quantityKg;
    totalTradeValueEur += offer.tradeValueEur;
    totalDeliveryCostEur += offer.deliveryCostEur;

    pushAggregate(
      speciesMap,
      offer.speciesHeadline,
      () => ({ species: offer.speciesHeadline, purchaseCount: 0, quantityKg: 0, tradeValueEur: 0 }),
      (row) => {
        row.purchaseCount += 1;
        row.quantityKg = roundCurrency(row.quantityKg + offer.quantityKg);
        row.tradeValueEur = roundCurrency(row.tradeValueEur + offer.tradeValueEur);
      },
    );

    pushAggregate(
      sellerMap,
      offer.sellerName,
      () => ({ sellerName: offer.sellerName, purchaseCount: 0, quantityKg: 0, tradeValueEur: 0 }),
      (row) => {
        row.purchaseCount += 1;
        row.quantityKg = roundCurrency(row.quantityKg + offer.quantityKg);
        row.tradeValueEur = roundCurrency(row.tradeValueEur + offer.tradeValueEur);
      },
    );

    if (offer.month) {
      pushAggregate(
        monthlyMap,
        offer.month,
        () => ({ month: offer.month, purchaseCount: 0, quantityKg: 0, tradeValueEur: 0 }),
        (row) => {
          row.purchaseCount += 1;
          row.quantityKg = roundCurrency(row.quantityKg + offer.quantityKg);
          row.tradeValueEur = roundCurrency(row.tradeValueEur + offer.tradeValueEur);
        },
      );
    }
  });

  return {
    buyer: {
      id: safeString(buyer?.id),
      companyName: safeString(buyer?.company_name),
      email: safeString(buyer?.email),
      contactName: safeString(buyer?.contact_name),
      city: safeString(buyer?.city),
    },
    summary: {
      purchaseCount: offers.length,
      totalQuantityKg: roundCurrency(totalQuantityKg),
      totalTradeValueEur: roundCurrency(totalTradeValueEur),
      totalDeliveryCostEur: roundCurrency(totalDeliveryCostEur),
      totalValueEur: roundCurrency(totalTradeValueEur + totalDeliveryCostEur),
      firstPurchaseAt: offers.length > 0 ? offers[offers.length - 1].purchaseDate : "",
      latestPurchaseAt: offers.length > 0 ? offers[0].purchaseDate : "",
      topSpecies: Array.from(speciesMap.values()).sort((left, right) => right.tradeValueEur - left.tradeValueEur),
      topSellers: Array.from(sellerMap.values()).sort((left, right) => right.tradeValueEur - left.tradeValueEur),
      monthly: Array.from(monthlyMap.values()).sort((left, right) => left.month.localeCompare(right.month)),
    },
    purchases: offers,
  };
}
