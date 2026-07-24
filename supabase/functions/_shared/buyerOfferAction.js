function safeString(value) {
  return String(value || "").trim();
}

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function statusOf(offer) {
  return safeString(offer?.status).toLowerCase();
}

export function buildBuyerOfferActionUpdate(action, offer, payload = {}) {
  const status = statusOf(offer);

  if (action === "viewed") {
    if (!["sent", "viewed"].includes(status)) {
      throw new Error("Offer can only be marked viewed from an open state");
    }
    return { status: "viewed" };
  }

  if (action === "counter") {
    if (!["sent", "viewed"].includes(status)) {
      throw new Error("Counter offer is only allowed for open offers");
    }

    const price = safeNumber(payload.counterPricePerKg);
    if (price == null || price <= 0) {
      throw new Error("Counter offer price missing or invalid");
    }

    return {
      status: "countered",
      counter_price_per_kg: price,
      buyer_message: payload.buyerMessage ? String(payload.buyerMessage) : null,
    };
  }

  if (action === "reserve") {
    if (!["sent", "viewed"].includes(status)) {
      throw new Error("Reservation is only allowed for open offers");
    }

    const reservedKilos = safeNumber(payload.reservedKilos ?? offer?.total_kilos);
    if (reservedKilos == null || reservedKilos <= 0) {
      throw new Error("Reserved kilos missing or invalid");
    }

    return {
      status: "reserved",
      reserved_kilos: reservedKilos,
      buyer_message: null,
    };
  }

  if (action === "reject") {
    if (["accepted", "sold", "cancelled", "rejected"].includes(status)) {
      throw new Error("Offer cannot be rejected from its current state");
    }
    return { status: "rejected" };
  }

  if (action === "cancel") {
    if (status !== "sold") {
      throw new Error("Only sold offers can be hidden from buyer list");
    }
    return { status: "cancelled" };
  }

  if (action === "update_fulfillment") {
    if (status !== "accepted") {
      throw new Error("Fulfillment status can only be updated for accepted trades");
    }

    const fulfillmentStatus = safeString(payload.fulfillmentStatus);
    if (!["awaiting_contact", "delivery_agreed", "delivered", "received"].includes(fulfillmentStatus)) {
      throw new Error("Invalid fulfillment status");
    }

    return { fulfillment_status: fulfillmentStatus };
  }

  if (action === "mark_paid") {
    const billingStatus = safeString(offer?.billing_status).toLowerCase();
    if (!["invoiced", "paid"].includes(billingStatus)) {
      throw new Error("Invoice can only be marked paid after it has been invoiced");
    }

    return {
      billing_status: "paid",
      billed_at: safeString(offer?.billed_at) || new Date().toISOString(),
      paid_at: new Date().toISOString(),
    };
  }

  throw new Error("Unsupported buyer offer action");
}

export function canBuyerAccessOffer(offer, buyer, profile) {
  const buyerId = safeString(buyer?.id);
  const profileBuyerId = safeString(profile?.buyer_id);
  const offerBuyerId = safeString(offer?.buyer_id);
  const offerBuyerEmail = safeString(offer?.buyer_email).toLowerCase();
  const allowedEmails = [
    safeString(buyer?.email).toLowerCase(),
    safeString(buyer?.contact_email).toLowerCase(),
    safeString(buyer?.billing_email).toLowerCase(),
    safeString(profile?.email).toLowerCase(),
    safeString(profile?.contact_email).toLowerCase(),
    safeString(profile?.billing_email).toLowerCase(),
  ].filter(Boolean);

  if (buyerId && offerBuyerId && buyerId === offerBuyerId) return true;
  if (profileBuyerId && offerBuyerId && profileBuyerId === offerBuyerId) return true;
  return allowedEmails.includes(offerBuyerEmail);
}

export function canManageFulfillment(offer, profile, buyer) {
  if (safeString(profile?.role) === "owner") return true;
  if (safeString(offer?.seller_user_id) === safeString(profile?.id)) return true;
  return canBuyerAccessOffer(offer, buyer, profile);
}
