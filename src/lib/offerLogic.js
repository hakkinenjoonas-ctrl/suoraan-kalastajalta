function normalizeOfferMatchValue(value) {
  return String(value || "").trim();
}

export const BUYER_OFFER_STATUS = Object.freeze({
  SENT: "sent",
  VIEWED: "viewed",
  COUNTERED: "countered",
  RESERVED: "reserved",
  ACCEPTED: "accepted",
  SOLD: "sold",
  REJECTED: "rejected",
  EXPIRED: "expired",
  CANCELLED: "cancelled",
});

export const BUYER_OFFER_OPEN_RESPONSE_STATUSES = Object.freeze([
  BUYER_OFFER_STATUS.SENT,
  BUYER_OFFER_STATUS.VIEWED,
]);

export const BUYER_OFFER_ACTION_REQUIRED_STATUSES = Object.freeze([
  BUYER_OFFER_STATUS.RESERVED,
  BUYER_OFFER_STATUS.COUNTERED,
]);

export const BUYER_OFFER_RESPONDED_STATUSES = Object.freeze([
  BUYER_OFFER_STATUS.COUNTERED,
  BUYER_OFFER_STATUS.RESERVED,
  BUYER_OFFER_STATUS.ACCEPTED,
  BUYER_OFFER_STATUS.REJECTED,
]);

export const BUYER_OFFER_COMPETING_OPEN_STATUSES = Object.freeze([
  BUYER_OFFER_STATUS.SENT,
  BUYER_OFFER_STATUS.VIEWED,
  BUYER_OFFER_STATUS.COUNTERED,
  BUYER_OFFER_STATUS.RESERVED,
]);

export const BUYER_OFFER_QUERYABLE_STATUSES = Object.freeze([
  BUYER_OFFER_STATUS.SENT,
  BUYER_OFFER_STATUS.VIEWED,
  BUYER_OFFER_STATUS.COUNTERED,
  BUYER_OFFER_STATUS.RESERVED,
  BUYER_OFFER_STATUS.ACCEPTED,
  BUYER_OFFER_STATUS.SOLD,
  BUYER_OFFER_STATUS.REJECTED,
  BUYER_OFFER_STATUS.EXPIRED,
  BUYER_OFFER_STATUS.CANCELLED,
]);

export function hasBuyerOfferStatus(status, allowedStatuses) {
  return allowedStatuses.includes(String(status || "").trim());
}

export function isBuyerOfferAccepted(status) {
  return String(status || "").trim() === BUYER_OFFER_STATUS.ACCEPTED;
}

export function isBuyerOfferReserved(status) {
  return String(status || "").trim() === BUYER_OFFER_STATUS.RESERVED;
}

export function isBuyerOfferCountered(status) {
  return String(status || "").trim() === BUYER_OFFER_STATUS.COUNTERED;
}

export function isBuyerOfferRejected(status) {
  return String(status || "").trim() === BUYER_OFFER_STATUS.REJECTED;
}

export function isBuyerOfferSold(status) {
  return String(status || "").trim() === BUYER_OFFER_STATUS.SOLD;
}

export function isBuyerOfferActionRequired(status) {
  return hasBuyerOfferStatus(status, BUYER_OFFER_ACTION_REQUIRED_STATUSES);
}

export function isBuyerOfferOpenForBuyerActions(status) {
  return hasBuyerOfferStatus(status, BUYER_OFFER_OPEN_RESPONSE_STATUSES);
}

export function shouldRevealBuyerIdentityForStatus(status) {
  return isBuyerOfferAccepted(status);
}

export function getBuyerOfferAcceptanceActionLabel(status) {
  if (isBuyerOfferReserved(status)) return "Hyväksy varaus";
  if (isBuyerOfferCountered(status)) return "Hyväksy vastatarjous";
  return "Hyväksy kauppa";
}

export function getBuyerOffersFilterForStatus(status) {
  if (isBuyerOfferAccepted(status) || isBuyerOfferSold(status)) return "accepted";
  if (isBuyerOfferReserved(status)) return "reserved";
  if (isBuyerOfferCountered(status)) return "countered";
  if (isBuyerOfferRejected(status)) return "rejected";
  return "open";
}

export function buildOpenOfferedEntriesSummary(groupedBuyerOffers, formatSpeciesLabel) {
  return Array.from(
    (groupedBuyerOffers || [])
      .filter(({ reservation }) => !isBuyerOfferAccepted(reservation?.status))
      .reduce((acc, { entry, buyerMatches, reservation }) => {
        const matchIds = buyerMatches.map((offer) => offer.id).sort().join("|");
        const groupKey = matchIds || `entry:${entry.id}`;
        const existing = acc.get(groupKey);
        const speciesLabel = formatSpeciesLabel(entry.species);
        const hasMixedBuyerOffer = buyerMatches.some((offer) => getOfferSummaryLines(offer?.species_summary).length > 1);

        if (!existing) {
          acc.set(groupKey, {
            id: entry.id,
            entryIds: [entry.id],
            species: hasMixedBuyerOffer ? "Monilajinen erä" : speciesLabel,
            speciesList: [speciesLabel],
            kilos: Number(entry.kilos || 0),
            date: entry.date || "",
            area: [entry.area, entry.municipality, entry.spot].filter(Boolean).join(" / "),
            buyerCount: buyerMatches.length,
            reservationStatus: reservation?.status || "",
          });
          return acc;
        }

        existing.entryIds.push(entry.id);
        existing.kilos += Number(entry.kilos || 0);
        if (!existing.speciesList.includes(speciesLabel)) {
          existing.speciesList.push(speciesLabel);
        }
        if ((!existing.date || existing.date > (entry.date || "")) && entry.date) {
          existing.date = entry.date;
        }
        return acc;
      }, new Map())
      .values()
  )
    .map((item) => ({
      ...item,
      mixedSummary: item.species === "Monilajinen erä" ? item.speciesList.join(", ") : "",
    }))
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
}

function getOfferSummaryLines(summary) {
  return String(summary || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function stripOfferTraceabilityText(line) {
  return String(line || "")
    .replace(/\s*·\s*Erätunnus\s+[A-Z0-9-]+/gi, "")
    .trim();
}

export function getOfferSpeciesHeadline(summary, options = {}) {
  const hideTraceability = Boolean(options?.hideTraceability);
  const firstLine = (String(summary || "Kalaerä").split("\n")[0] || "Kalaerä");
  const sanitizedFirstLine = hideTraceability ? stripOfferTraceabilityText(firstLine) : firstLine;
  const compactLine = String(sanitizedFirstLine || "")
    .replace(/\s*·\s*Hinta(?:\s+ALV\s+0\s*%)?[^·]+/gi, "")
    .replace(/\s*·\s*Hinta\s+sis\.\s*ALV\s+[0-9]+(?:[.,][0-9]+)?\s*%[^·]+/gi, "")
    .replace(/\s*·\s*Pyyntipäivämäärä\s+[^·]+/gi, "")
    .replace(/\s*·\s*Erätunnus\s+[A-Z0-9-]+/gi, "")
    .trim();
  return compactLine
    .replace(/:\s*\d+(?:[.,]\d+)?\s*kg(?:\s*\([^)]*\))?$/i, "")
    .replace(/:\s*\d+(?:[.,]\d+)?\s*kpl(?:\s*\([^)]*\))?$/i, "")
    .trim() || "Kalaerä";
}

export function offersShareSameLot(left, right) {
  if (!left || !right) return false;

  const sameSeller = normalizeOfferMatchValue(left.seller_user_id) === normalizeOfferMatchValue(right.seller_user_id);
  if (!sameSeller) return false;

  const leftBatchId = normalizeOfferMatchValue(left.batch_id);
  const rightBatchId = normalizeOfferMatchValue(right.batch_id);
  if (leftBatchId && rightBatchId && leftBatchId === rightBatchId) {
    return true;
  }

  return (
    normalizeOfferMatchValue(left.species_summary) === normalizeOfferMatchValue(right.species_summary) &&
    Number(left.total_kilos || 0) === Number(right.total_kilos || 0) &&
    normalizeOfferMatchValue(left.area) === normalizeOfferMatchValue(right.area) &&
    normalizeOfferMatchValue(left.spot) === normalizeOfferMatchValue(right.spot)
  );
}

export function buildPushEventHeadline(offer) {
  return getOfferSpeciesHeadline(offer?.species_summary, { hideTraceability: true }) || "Kalaerä";
}

export function getAcceptedInvoiceSourceLabel(offer) {
  if (offer?.counter_price_per_kg !== "" && offer?.counter_price_per_kg != null) return "Viimeisin hyväksytty vastatarjous";
  if (offer?.reserved_kilos !== "" && offer?.reserved_kilos != null) return "Viimeisin hyväksytty varaus";
  return "Hyväksytty tarjous";
}

export function buyerStatusLabel(status) {
  if (status === BUYER_OFFER_STATUS.SENT) return "Tarjous lähetetty";
  if (status === BUYER_OFFER_STATUS.VIEWED) return "Avattu";
  if (status === BUYER_OFFER_STATUS.COUNTERED) return "Vastatarjous";
  if (status === BUYER_OFFER_STATUS.RESERVED) return "Varattu";
  if (status === BUYER_OFFER_STATUS.ACCEPTED) return "Kauppa hyväksytty";
  if (status === BUYER_OFFER_STATUS.SOLD) return "MYYTY JO TOISELLE OSTAJALLE";
  if (status === BUYER_OFFER_STATUS.REJECTED) return "Hylätty";
  if (status === BUYER_OFFER_STATUS.CANCELLED) return "Peruttu";
  return status || "-";
}
