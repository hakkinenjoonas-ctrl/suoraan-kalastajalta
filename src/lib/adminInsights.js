import {
  BUYER_OFFER_ACTION_REQUIRED_STATUSES,
  BUYER_OFFER_OPEN_RESPONSE_STATUSES,
  buyerStatusLabel,
  getOfferSpeciesHeadline,
  hasBuyerOfferStatus,
  isBuyerOfferAccepted,
} from "./offerLogic.js";

function toTimestamp(value) {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function hoursSince(value, now = Date.now()) {
  const timestamp = toTimestamp(value);
  if (!timestamp) return 0;
  return Math.max(0, (now - timestamp) / (1000 * 60 * 60));
}

function getBuyerLabel(offer, buyersById) {
  const buyer = buyersById.get(String(offer?.buyer_id || "").trim());
  return (
    buyer?.company_name ||
    offer?.buyer_company_name ||
    offer?.buyer_contact_name ||
    offer?.buyer_email ||
    "Ostaja"
  );
}

function getOfferTimestamp(offer) {
  return offer?.updated_at || offer?.created_at || "";
}

function getOfferAgeLabel(offer, now = Date.now()) {
  const ageHours = hoursSince(getOfferTimestamp(offer), now);
  if (ageHours >= 48) return `${Math.round(ageHours / 24)} pv`;
  if (ageHours >= 1) return `${Math.round(ageHours)} h`;
  return `${Math.max(1, Math.round(ageHours * 60))} min`;
}

function buildPushTokenMaps(appPushTokens) {
  const activeBuyerTokens = new Map();
  const activeUserTokens = new Map();

  (appPushTokens || []).forEach((tokenRow) => {
    if (!tokenRow?.is_active) return;
    const buyerId = String(tokenRow.buyer_id || "").trim();
    const userId = String(tokenRow.user_id || "").trim();
    if (buyerId) {
      activeBuyerTokens.set(buyerId, (activeBuyerTokens.get(buyerId) || 0) + 1);
    }
    if (userId) {
      activeUserTokens.set(userId, (activeUserTokens.get(userId) || 0) + 1);
    }
  });

  return { activeBuyerTokens, activeUserTokens };
}

function getActorLabelByUserId(userId, ownerProfilesById) {
  const profile = ownerProfilesById.get(String(userId || "").trim());
  return (
    profile?.display_name ||
    profile?.company_name ||
    profile?.email ||
    "Käyttäjä"
  );
}

function buildStuckOffers(buyerOffers, buyersById, now = Date.now()) {
  return (buyerOffers || [])
    .map((offer) => {
      const status = String(offer?.status || "").trim();
      const ageHours = hoursSince(getOfferTimestamp(offer), now);

      if (hasBuyerOfferStatus(status, BUYER_OFFER_ACTION_REQUIRED_STATUSES) && ageHours >= 12) {
        return {
          id: offer.id,
          type: "seller_action_required",
          severity: "warning",
          buyerLabel: getBuyerLabel(offer, buyersById),
          speciesHeadline: getOfferSpeciesHeadline(offer?.species_summary, { hideTraceability: true }) || "Kalaerä",
          ageHours,
          ageLabel: getOfferAgeLabel(offer, now),
          statusLabel: buyerStatusLabel(status),
          detail: status === "reserved"
            ? "Varaus odottaa edelleen kalastajan hyväksyntää tai hylkäystä."
            : "Vastatarjous odottaa edelleen kalastajan päätöstä.",
          timestamp: getOfferTimestamp(offer),
        };
      }

      if (hasBuyerOfferStatus(status, BUYER_OFFER_OPEN_RESPONSE_STATUSES) && ageHours >= 24) {
        return {
          id: offer.id,
          type: "buyer_response_pending",
          severity: "info",
          buyerLabel: getBuyerLabel(offer, buyersById),
          speciesHeadline: getOfferSpeciesHeadline(offer?.species_summary, { hideTraceability: true }) || "Kalaerä",
          ageHours,
          ageLabel: getOfferAgeLabel(offer, now),
          statusLabel: buyerStatusLabel(status),
          detail: "Tarjous on ollut auki ilman ostajan vastausta poikkeuksellisen pitkään.",
          timestamp: getOfferTimestamp(offer),
        };
      }

      if (isBuyerOfferAccepted(status) && String(offer?.fulfillment_status || "").trim() === "awaiting_contact" && ageHours >= 24) {
        return {
          id: offer.id,
          type: "accepted_waiting_contact",
          severity: "warning",
          buyerLabel: getBuyerLabel(offer, buyersById),
          speciesHeadline: getOfferSpeciesHeadline(offer?.species_summary, { hideTraceability: true }) || "Kalaerä",
          ageHours,
          ageLabel: getOfferAgeLabel(offer, now),
          statusLabel: "Kauppa hyväksytty",
          detail: "Hyväksytty kauppa odottaa edelleen yhteydenottoa tai toimituksen etenemistä.",
          timestamp: getOfferTimestamp(offer),
        };
      }

      return null;
    })
    .filter(Boolean)
    .sort((left, right) => right.ageHours - left.ageHours);
}

function buildMissingPushBuyers(buyerOffers, buyersById, activeBuyerTokens, now = Date.now()) {
  const grouped = new Map();

  (buyerOffers || [])
    .filter((offer) => {
      const status = String(offer?.status || "").trim();
      const buyerId = String(offer?.buyer_id || "").trim();
      if (!buyerId) return false;
      return (
        hasBuyerOfferStatus(status, BUYER_OFFER_OPEN_RESPONSE_STATUSES) ||
        hasBuyerOfferStatus(status, BUYER_OFFER_ACTION_REQUIRED_STATUSES)
      ) && !activeBuyerTokens.get(buyerId);
    })
    .forEach((offer) => {
      const buyerId = String(offer?.buyer_id || "").trim();
      const existing = grouped.get(buyerId);
      if (existing) {
        existing.offerCount += 1;
        if (toTimestamp(getOfferTimestamp(offer)) > toTimestamp(existing.latestTimestamp)) {
          existing.latestTimestamp = getOfferTimestamp(offer);
          existing.latestOfferId = offer.id;
        }
        return;
      }

      grouped.set(buyerId, {
        buyerId,
        latestOfferId: offer.id,
        latestTimestamp: getOfferTimestamp(offer),
        buyerLabel: getBuyerLabel(offer, buyersById),
        buyerEmail: offer?.buyer_email || "",
        offerCount: 1,
        ageLabel: getOfferAgeLabel(offer, now),
      });
    });

  return Array.from(grouped.values()).sort(
    (left, right) => toTimestamp(right.latestTimestamp) - toTimestamp(left.latestTimestamp),
  );
}

function buildInvoiceWatch(buyerOffers, buyersById) {
  return (buyerOffers || [])
    .filter((offer) => ["invoiced", "paid"].includes(String(offer?.billing_status || "unbilled")))
    .map((offer) => ({
      id: offer.id,
      buyerLabel: getBuyerLabel(offer, buyersById),
      speciesHeadline: getOfferSpeciesHeadline(offer?.species_summary, { hideTraceability: true }) || "Kalaerä",
      billingStatus: String(offer?.billing_status || "unbilled"),
      statusLabel: String(offer?.billing_status || "unbilled") === "paid" ? "Maksettu" : "Laskutettu",
      timestamp: offer?.paid_at || offer?.billed_at || getOfferTimestamp(offer),
      amountKg: Number(offer?.reserved_kilos || offer?.total_kilos || 0),
      pricePerKg: Number(
        offer?.counter_price_per_kg !== "" && offer?.counter_price_per_kg != null
          ? offer.counter_price_per_kg
          : offer?.price_per_kg || 0,
      ),
    }))
    .sort((left, right) => toTimestamp(right.timestamp) - toTimestamp(left.timestamp));
}

function buildRecentOffers(buyerOffers, buyersById) {
  return (buyerOffers || [])
    .map((offer) => ({
      id: offer.id,
      buyerLabel: getBuyerLabel(offer, buyersById),
      buyerEmail: offer?.buyer_email || "",
      speciesHeadline: getOfferSpeciesHeadline(offer?.species_summary, { hideTraceability: true }) || "Kalaerä",
      status: String(offer?.status || "").trim(),
      statusLabel: buyerStatusLabel(offer?.status),
      fulfillmentStatus: String(offer?.fulfillment_status || "").trim(),
      billingStatus: String(offer?.billing_status || "unbilled").trim(),
      quantityLabel: `${Number(offer?.reserved_kilos || offer?.total_kilos || 0)} kg`,
      timestamp: getOfferTimestamp(offer),
      createdAt: offer?.created_at || "",
      sellerName: offer?.seller_name || "Kalastaja",
      deliveryCity: offer?.buyer_delivery_city || offer?.delivery_destination_city || "",
      hasPushReadyBuyer: Boolean(String(offer?.buyer_id || "").trim()),
    }))
    .sort((left, right) => toTimestamp(right.timestamp) - toTimestamp(left.timestamp));
}

function buildBuyerOverview(buyerOffers, buyersById, activeBuyerTokens) {
  const grouped = new Map();

  (buyerOffers || []).forEach((offer) => {
    const buyerId = String(offer?.buyer_id || "").trim() || `email:${String(offer?.buyer_email || "").trim().toLowerCase()}`;
    const existing = grouped.get(buyerId) || {
      buyerId,
      buyerLabel: getBuyerLabel(offer, buyersById),
      buyerEmail: offer?.buyer_email || "",
      totalOffers: 0,
      openOffers: 0,
      actionRequired: 0,
      acceptedOffers: 0,
      invoicedOffers: 0,
      hasActivePushToken: Boolean(activeBuyerTokens.get(String(offer?.buyer_id || "").trim())),
      latestTimestamp: "",
    };

    existing.totalOffers += 1;
    if (hasBuyerOfferStatus(offer?.status, BUYER_OFFER_OPEN_RESPONSE_STATUSES)) existing.openOffers += 1;
    if (hasBuyerOfferStatus(offer?.status, BUYER_OFFER_ACTION_REQUIRED_STATUSES)) existing.actionRequired += 1;
    if (isBuyerOfferAccepted(offer?.status)) existing.acceptedOffers += 1;
    if (["invoiced", "paid"].includes(String(offer?.billing_status || ""))) existing.invoicedOffers += 1;
    if (toTimestamp(getOfferTimestamp(offer)) > toTimestamp(existing.latestTimestamp)) {
      existing.latestTimestamp = getOfferTimestamp(offer);
    }

    grouped.set(buyerId, existing);
  });

  return Array.from(grouped.values()).sort((left, right) => toTimestamp(right.latestTimestamp) - toTimestamp(left.latestTimestamp));
}

function buildInconsistentStates(buyerOffers, buyersById, activeBuyerTokens) {
  const issues = [];

  (buyerOffers || []).forEach((offer) => {
    const status = String(offer?.status || "").trim();
    const billingStatus = String(offer?.billing_status || "unbilled").trim();
    const buyerLabel = getBuyerLabel(offer, buyersById);
    const speciesHeadline = getOfferSpeciesHeadline(offer?.species_summary, { hideTraceability: true }) || "Kalaerä";
    const baseIssue = {
      offerId: offer.id,
      buyerLabel,
      speciesHeadline,
      timestamp: getOfferTimestamp(offer),
    };

    if (billingStatus === "invoiced" && !offer?.billed_at) {
      issues.push({
        ...baseIssue,
        severity: "warning",
        detail: "Laskutustila on Laskutettu, mutta billed_at puuttuu.",
      });
    }

    if (billingStatus === "paid" && !offer?.paid_at) {
      issues.push({
        ...baseIssue,
        severity: "warning",
        detail: "Laskutustila on Maksettu, mutta paid_at puuttuu.",
      });
    }

    if (billingStatus === "paid" && !offer?.billed_at) {
      issues.push({
        ...baseIssue,
        severity: "warning",
        detail: "Kauppa on merkitty maksetuksi ilman laskutetuksi merkintää.",
      });
    }

    if (!isBuyerOfferAccepted(status) && billingStatus !== "unbilled") {
      issues.push({
        ...baseIssue,
        severity: "warning",
        detail: "Laskutustila ei ole enää Laskuttamaton, vaikka kauppaa ei ole hyväksytty.",
      });
    }

    if (isBuyerOfferAccepted(status)) {
      const missingBillingEmail = !String(offer?.buyer_billing_email || "").trim();
      const missingBillingAddress = ![
        offer?.buyer_billing_address,
        offer?.buyer_billing_postcode,
        offer?.buyer_billing_city,
      ].some(Boolean);

      if (missingBillingEmail || missingBillingAddress) {
        issues.push({
          ...baseIssue,
          severity: "warning",
          detail: "Hyväksytyltä kaupalta puuttuu laskutustietoja.",
        });
      }

      if (String(offer?.fulfillment_status || "").trim() === "delivered" && billingStatus === "unbilled") {
        issues.push({
          ...baseIssue,
          severity: "info",
          detail: "Kauppa on merkitty toimitetuksi, mutta laskutusta ei ole vielä käynnistetty.",
        });
      }
    }

    if (
      String(offer?.buyer_id || "").trim() &&
      (
        hasBuyerOfferStatus(status, BUYER_OFFER_OPEN_RESPONSE_STATUSES) ||
        hasBuyerOfferStatus(status, BUYER_OFFER_ACTION_REQUIRED_STATUSES)
      ) &&
      !activeBuyerTokens.get(String(offer?.buyer_id || "").trim())
    ) {
      issues.push({
        ...baseIssue,
        severity: "info",
        detail: "Ostajalta puuttuu aktiivinen push-token, joten push-ilmoitus voi jäädä lähettämättä.",
      });
    }
  });

  return issues.sort((left, right) => toTimestamp(right.timestamp) - toTimestamp(left.timestamp));
}

function buildRecentActivity({ entries, processedEntries, buyerOffers, appPushTokens, buyersById, ownerProfilesById }) {
  const events = [];

  (entries || []).forEach((entry) => {
    if (!entry?.createdAt) return;
    events.push({
      key: `entry-${entry.id}`,
      timestamp: entry.createdAt,
      title: "Saalis tallennettu",
      detail: `${entry.ownerName || "Kalastaja"} lisäsi erän ${entry.species || "Kalaerä"} (${Number(entry.kilos || 0)} kg).`,
      kind: "catch_entry",
    });
  });

  (processedEntries || []).forEach((entry) => {
    if (!entry?.createdAt) return;
    events.push({
      key: `processed-${entry.id}`,
      timestamp: entry.createdAt,
      title: "Jaloste-erä tallennettu",
      detail: `${entry.ownerName || "Jalostaja"} lisäsi erän ${entry.productName || "Jaloste-erä"} (${Number(entry.kilos || 0)} kg).`,
      kind: "processed_entry",
    });
  });

  (buyerOffers || []).forEach((offer) => {
    const buyerLabel = getBuyerLabel(offer, buyersById);
    const headline = getOfferSpeciesHeadline(offer?.species_summary, { hideTraceability: true }) || "Kalaerä";
    if (offer?.created_at) {
      events.push({
        key: `buyer-offer-created-${offer.id}`,
        timestamp: offer.created_at,
        title: "Tarjous lähetetty",
        detail: `${headline} lähetettiin ostajalle ${buyerLabel}.`,
        kind: "offer_created",
      });
    }
    if (offer?.updated_at && offer.updated_at !== offer.created_at) {
      events.push({
        key: `buyer-offer-updated-${offer.id}`,
        timestamp: offer.updated_at,
        title: `Tarjouksen tila: ${buyerStatusLabel(offer.status)}`,
        detail: `${headline} · ${buyerLabel}`,
        kind: "offer_updated",
      });
    }
    if (offer?.billed_at) {
      events.push({
        key: `buyer-offer-billed-${offer.id}`,
        timestamp: offer.billed_at,
        title: "Lasku merkitty lähetetyksi",
        detail: `${headline} · ${buyerLabel}`,
        kind: "offer_billed",
      });
    }
    if (offer?.paid_at) {
      events.push({
        key: `buyer-offer-paid-${offer.id}`,
        timestamp: offer.paid_at,
        title: "Maksu merkitty vastaanotetuksi",
        detail: `${headline} · ${buyerLabel}`,
        kind: "offer_paid",
      });
    }
  });

  (appPushTokens || [])
    .filter((tokenRow) => tokenRow?.is_active && tokenRow?.last_seen_at)
    .forEach((tokenRow) => {
      const profile = ownerProfilesById.get(String(tokenRow?.user_id || "").trim());
      const actorLabel = profile?.display_name || profile?.company_name || profile?.email || tokenRow?.device_label || "Käyttäjä";
      events.push({
        key: `push-token-${tokenRow.id}`,
        timestamp: tokenRow.last_seen_at,
        title: "Push-token nähty aktiivisena",
        detail: `${actorLabel} · ${tokenRow.platform || "laite"}`,
        kind: "push_seen",
      });
    });

  return events
    .sort((left, right) => toTimestamp(right.timestamp) - toTimestamp(left.timestamp))
    .slice(0, 100);
}

function buildPushTokenInventory(appPushTokens, buyersById, ownerProfilesById) {
  return (appPushTokens || [])
    .filter((tokenRow) => tokenRow?.is_active)
    .map((tokenRow) => ({
      id: tokenRow.id,
      actorLabel: getActorLabelByUserId(tokenRow?.user_id, ownerProfilesById),
      buyerLabel: buyersById.get(String(tokenRow?.buyer_id || "").trim())?.company_name || "",
      role: tokenRow?.role || "",
      platform: tokenRow?.platform || "",
      lastSeenAt: tokenRow?.last_seen_at || "",
      deviceLabel: tokenRow?.device_label || "",
      hasBuyerLink: Boolean(String(tokenRow?.buyer_id || "").trim()),
    }))
    .sort((left, right) => toTimestamp(right.lastSeenAt) - toTimestamp(left.lastSeenAt));
}

export function buildAdminOperationsSnapshot({
  buyerOffers = [],
  buyers = [],
  ownerUserProfiles = [],
  appPushTokens = [],
  entries = [],
  processedEntries = [],
} = {}) {
  const buyersById = new Map((buyers || []).map((buyer) => [String(buyer?.id || "").trim(), buyer]));
  const ownerProfilesById = new Map((ownerUserProfiles || []).map((profile) => [String(profile?.id || "").trim(), profile]));
  const { activeBuyerTokens } = buildPushTokenMaps(appPushTokens);

  const stuckOffers = buildStuckOffers(buyerOffers, buyersById);
  const missingPushBuyers = buildMissingPushBuyers(buyerOffers, buyersById, activeBuyerTokens);
  const invoiceWatch = buildInvoiceWatch(buyerOffers, buyersById);
  const inconsistentStates = buildInconsistentStates(buyerOffers, buyersById, activeBuyerTokens);
  const recentOffers = buildRecentOffers(buyerOffers, buyersById);
  const buyerOverview = buildBuyerOverview(buyerOffers, buyersById, activeBuyerTokens);
  const pushTokenInventory = buildPushTokenInventory(appPushTokens, buyersById, ownerProfilesById);
  const recentActivity = buildRecentActivity({
    entries,
    processedEntries,
    buyerOffers,
    appPushTokens,
    buyersById,
    ownerProfilesById,
  });

  return {
    stuckOffers,
    missingPushBuyers,
    invoiceWatch,
    inconsistentStates,
    recentOffers,
    buyerOverview,
    pushTokenInventory,
    recentActivity,
    metrics: {
      stuckOffers: stuckOffers.length,
      missingPushBuyers: missingPushBuyers.length,
      invoicedCount: invoiceWatch.filter((item) => item.billingStatus === "invoiced").length,
      inconsistentStates: inconsistentStates.length,
      recentOffers: recentOffers.length,
      activePushTokens: pushTokenInventory.length,
    },
  };
}
