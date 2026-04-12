function normalizeOfferMatchValue(value) {
  return String(value || "").trim();
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
  return sanitizedFirstLine
    .replace(/:\s*\d+(?:[.,]\d+)?\s*kg(?:\s*\([^)]*\))?$/i, "")
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
  if (status === "sent") return "Tarjous lähetetty";
  if (status === "viewed") return "Avattu";
  if (status === "countered") return "Vastatarjous";
  if (status === "reserved") return "Varattu";
  if (status === "accepted") return "Kauppa hyväksytty";
  if (status === "sold") return "MYYTY";
  if (status === "rejected") return "Hylätty";
  if (status === "cancelled") return "Peruttu";
  return status || "-";
}
