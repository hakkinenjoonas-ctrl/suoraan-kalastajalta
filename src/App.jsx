import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Preferences } from "@capacitor/preferences";
import { PushNotifications } from "@capacitor/push-notifications";
import { Share } from "@capacitor/share";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import {
  clearBrokenSession,
  findAllowedUserByEmail,
  findAllowedUsersByEmail,
  isMissingRefreshTokenError,
} from "./lib/auth.js";
import {
  BUYER_OFFER_ACTION_REQUIRED_STATUSES,
  BUYER_OFFER_COMPETING_OPEN_STATUSES,
  BUYER_OFFER_OPEN_RESPONSE_STATUSES,
  BUYER_OFFER_QUERYABLE_STATUSES,
  buildOpenOfferedEntriesSummary,
  buildPushEventHeadline,
  buyerStatusLabel,
  getBuyerOffersFilterForStatus,
  getAcceptedInvoiceSourceLabel,
  getOfferSpeciesHeadline,
  hasBuyerOfferStatus,
  isBuyerOfferAccepted,
  isBuyerOfferCountered,
  isBuyerOfferRejected,
  isBuyerOfferReserved,
  isBuyerOfferSold,
  offersShareSameLot,
  shouldRevealBuyerIdentityForStatus,
} from "./lib/offerLogic.js";
import {
  CATCH_FORM_DEFAULTS_KEY,
  COMMISSION_RATE,
  CUSTOM_LAKE_AREA_OPTION,
  CUSTOM_SEA_AREA_OPTION,
  DELIVERY_COMPETITION_AVAILABLE,
  ONBOARDING_GUIDE_MAX_VIEWS,
  ONBOARDING_GUIDE_STORAGE_PREFIX,
  PUSH_CHANNEL_ID,
  PUSH_SOUND_NAME,
  alwaysSuggestedDestinationCities,
  defaultAreas,
  deliveryMethods,
  finlandMunicipalities,
  fishSpecies,
  fishSpeciesByName,
  fishSpeciesCatalog,
  gearTypes,
  logisticsRegionCities,
  municipalityRegionMap,
  pickupPoints,
  processedProductTypes,
  processingMethods,
  routePrices,
  transportCompanies,
  transportModeLabels,
} from "./lib/constants.js";
import { applyGrossPriceInput, createSpeciesRow, safeId, today } from "./lib/helpers.js";
import {
  FISH_VAT_RATE,
  calculateGrossPrice,
  calculateNetPrice,
  calculateOfferCommissionValues,
  formatDeliveredPricePerKg,
  formatDeliveryPrice,
  formatVatPercent,
} from "./lib/pricing.js";
import {
  DEFAULT_PUBLIC_APP_URL,
  supabase,
} from "./lib/supabase.js";
import { tableExists } from "./services/database.js";
import {
  fetchBuyerReport,
  getPublicBatchInfoUrl,
  invokeAdminDeleteEntity,
  invokeBuyerOfferAction,
  invokeBulkOfferDispatch,
  invokeEdgeFunctionAuthenticated,
} from "./services/edgeFunctions.js";
import {
  ANONYMOUS_SELLER_LABEL,
  buildRoleOptionLabel,
  buyerStatusBadgeStyle,
  formatDeliveryDestinations,
  getPublicPickupLocation,
  normalizeDestinationCities,
  normalizeEmail,
  resolveBuyerDestinationCity,
  responsiveGridStyle,
  roleLabel,
  styles,
} from "./lib/ui.js";
import {
  BuyerResponsesSection,
  LinkedBuyerOfferCard,
  OfferedEntriesDetailsSection,
  OfferedEntriesSummarySection,
  WholesaleOffersOverviewSection,
} from "./components/wholesaleOffersSections.jsx";
import AdminOperationsView from "./components/AdminOperationsView.jsx";
import ProcessedLabel4x3, { PROCESSED_LABEL_4X3_SIZE_MM } from "./components/ProcessedLabel4x3.jsx";
import ProcessedLabel4x6, { PROCESSED_LABEL_4X6_SIZE_MM } from "./components/ProcessedLabel4x6.jsx";
import ThermalLabel4x3, { THERMAL_LABEL_4X3_SIZE_MM } from "./components/ThermalLabel4x3.jsx";
import ThermalLabel4x6Portrait, { THERMAL_LABEL_4X6_SIZE_MM } from "./components/ThermalLabel4x6Portrait.jsx";

function getPublicAppBaseUrl() {
  const configuredUrl = typeof import.meta !== "undefined" ? import.meta.env?.VITE_PUBLIC_APP_URL : "";
  if (configuredUrl) return String(configuredUrl).replace(/\/$/, "");

  if (typeof window !== "undefined") {
    const origin = String(window.location.origin || "").replace(/\/$/, "");
    if (origin && !origin.includes("localhost") && !origin.includes("127.0.0.1")) {
      return origin;
    }
  }

  return DEFAULT_PUBLIC_APP_URL;
}

const PUSH_TOKEN_STORAGE_KEY = "sk:last_push_token";

async function runWithConcurrency(items, concurrency, worker) {
  const normalizedConcurrency = Math.max(1, Number(concurrency || 1));
  const results = new Array(items.length);
  let nextIndex = 0;

  const runWorker = async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(normalizedConcurrency, items.length) }, () => runWorker())
  );

  return results;
}

function getSpeciesRowLabel(row) {
  if (row?.species === "Muu") {
    return String(row?.customSpecies || "").trim() || "Muu";
  }
  return row?.species || "";
}

function getSpeciesMetadata(label) {
  const normalized = String(label || "")
    .split(",")[0]
    .replace(/\b(filee|filet|avattu|perattu|päätön|nyljetty)\b/gi, "")
    .replace(/\b\d+\+\s*cm\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return fishSpeciesByName[normalized] || null;
}

function isCrayfishSpecies(label) {
  const metadata = getSpeciesMetadata(label);
  return metadata?.scientific === "Pacifastacus leniusculus" || metadata?.scientific === "Astacus astacus";
}

function getSpeciesPriceUnit(label) {
  return isCrayfishSpecies(label) ? "kpl" : "kg";
}

function normalizeSpeciesDisplayLabel(label) {
  const raw = String(label || "").trim();
  if (!raw) return "Muu";

  const collapsed = raw.replace(/\s+/g, " ").trim();
  const lowerCollapsed = collapsed.toLowerCase();
  const sortedSpecies = [...fishSpeciesCatalog]
    .map((item) => item.name_fi)
    .sort((left, right) => right.length - left.length);

  const matchedSpecies = sortedSpecies.find((speciesName) => {
    const lowerSpecies = speciesName.toLowerCase();
    return lowerCollapsed === lowerSpecies || lowerCollapsed.startsWith(`${lowerSpecies} `) || lowerCollapsed.startsWith(`${lowerSpecies},`);
  });

  if (!matchedSpecies) return collapsed;

  const suffix = collapsed.slice(matchedSpecies.length).trim();
  if (!suffix) return matchedSpecies;

  if (suffix.startsWith(",")) {
    return `${matchedSpecies}${suffix}`;
  }

  return `${matchedSpecies} ${suffix}`;
}

function formatSpeciesForSale(label) {
  return normalizeSpeciesDisplayLabel(label);
}

function formatSpeciesForLabelTitle(label) {
  const normalized = normalizeSpeciesDisplayLabel(label);
  if (!normalized) return "Muu";

  const metadata = getSpeciesMetadata(normalized);
  return metadata?.name_fi || normalized;
}

function formatSpeciesSummaryLine(label, kilos, count) {
  if (isCrayfishSpecies(label)) {
    return `${formatSpeciesForSale(label)}: ${count > 0 ? `${count} kpl` : "-"}${kilos > 0 ? ` (${kilos} kg)` : ""}`;
  }
  return `${formatSpeciesForSale(label)}: ${kilos} kg${count > 0 ? ` (${count} kpl)` : ""}`;
}

function isCrayfishOfferSummary(summary) {
  const text = String(summary || "").toLowerCase();
  return text.includes("täplärapu") ||
    text.includes("jokirapu") ||
    text.includes("pacifastacus leniusculus") ||
    text.includes("astacus astacus");
}

function getOfferDisplayUnit(offer) {
  return isCrayfishOfferSummary(offer?.species_summary) ? "kpl" : "kg";
}

function getOfferQuantityDisplay(offer) {
  const summary = String(offer?.species_summary || "");
  if (isCrayfishOfferSummary(summary)) {
    const countMatch = summary.match(/(\d+(?:[.,]\d+)?)\s*kpl/i);
    if (countMatch) return `${String(countMatch[1]).replace(".", ",")} kpl`;
  }
  const kilos = Number(offer?.total_kilos || 0);
  if (Number.isFinite(kilos) && kilos > 0) return `${kilos} kg`;
  return "-";
}

function getOfferCountDisplay(offer) {
  const summary = String(offer?.species_summary || "");
  const countInParenthesesMatch = summary.match(/\(([0-9]+(?:[.,][0-9]+)?)\s*kpl\)/i);
  if (countInParenthesesMatch) return `${String(countInParenthesesMatch[1]).replace(".", ",")} kpl`;

  if (isCrayfishOfferSummary(summary)) {
    const countMatch = summary.match(/(\d+(?:[.,]\d+)?)\s*kpl/i);
    if (countMatch) return `${String(countMatch[1]).replace(".", ",")} kpl`;
  }

  return "";
}

function formatSpeciesOfferSummaryLine(row) {
  const kilos = Number(row?.kilos || 0);
  const count = Number(row?.count || 0);
  const unit = getSpeciesPriceUnit(getSpeciesRowLabel(row));
  const parsedPrice = parseLocaleNumber(row?.price_per_kg);
  const grossPrice = parsedPrice == null ? null : calculateGrossPrice(parsedPrice);
  const price = parsedPrice == null ? "-" : `${parsedPrice.toLocaleString("fi-FI")} € / ${unit}`;
  const gross = grossPrice == null ? "-" : `${grossPrice.toLocaleString("fi-FI")} € / ${unit}`;
  const batchId = String(row?.batch_id || "").trim();
  const catchDate = String(row?.catch_date || row?.date || "").trim();
  return [
    formatSpeciesSummaryLine(getSpeciesRowLabel(row), kilos, count),
    `Hinta ALV 0 % ${price}`,
    `Hinta sis. ALV ${formatVatPercent()} % ${gross}`,
    catchDate ? `Pyyntipäivämäärä ${catchDate}` : "",
    batchId ? `Erätunnus ${batchId}` : "",
  ].filter(Boolean).join(" · ");
}

function parseTradeValueFromSpeciesSummary(summary) {
  return getOfferSummaryLines(summary).reduce((sum, line) => {
    const priceMatch = String(line).match(/Hinta(?:\s+ALV\s+0\s*%)?\s+([0-9]+(?:[.,][0-9]+)?)/i);
    if (!priceMatch) return sum;

    const parsedPrice = parseLocaleNumber(priceMatch[1]);
    if (parsedPrice == null || !Number.isFinite(parsedPrice) || parsedPrice <= 0) return sum;

    const countMatch = String(line).match(/\(([0-9]+(?:[.,][0-9]+)?)\s*kpl\)/i);
    if (countMatch) {
      const parsedCount = parseLocaleNumber(countMatch[1]);
      if (parsedCount == null || !Number.isFinite(parsedCount) || parsedCount <= 0) return sum;
      return sum + (parsedCount * parsedPrice);
    }

    const kiloMatch = String(line).match(/:\s*([0-9]+(?:[.,][0-9]+)?)\s*kg/i);
    const parsedKilos = kiloMatch ? parseLocaleNumber(kiloMatch[1]) : null;
    if (parsedKilos == null || !Number.isFinite(parsedKilos) || parsedKilos <= 0) return sum;
    return sum + (parsedKilos * parsedPrice);
  }, 0);
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

function stripOfferInlineMetaText(line, options = {}) {
  let cleaned = String(line || "");
  if (options?.hideTraceability) {
    cleaned = stripOfferTraceabilityText(cleaned);
  }
  if (options?.hidePrice) {
    cleaned = cleaned
      .replace(/\s*·\s*Hinta(?:\s+ALV\s+0\s*%)?\s+[^·]+/gi, "")
      .replace(/\s*·\s*Hinta\s+sis\.\s*ALV\s+[0-9]+(?:[.,][0-9]+)?\s*%\s+[^·]+/gi, "");
  }
  if (options?.hideCatchDate) {
    cleaned = cleaned.replace(/\s*·\s*Pyyntipäivämäärä\s+[^·]+/gi, "");
  }
  return cleaned.trim();
}

function formatSpeciesSummaryText(value, options = {}) {
  const hideTraceability = Boolean(options?.hideTraceability);
  const hidePrice = Boolean(options?.hidePrice);
  const hideCatchDate = Boolean(options?.hideCatchDate);
  return String(value || "")
    .split("\n")
    .map((line) => {
      const cleanedLine = stripOfferInlineMetaText(line, {
        hideTraceability,
        hidePrice,
        hideCatchDate,
      });
      const [speciesPart, ...rest] = cleanedLine.split(":");
      if (!speciesPart) return line;
      const formattedSpecies = formatSpeciesForSale(speciesPart.trim());
      return rest.length > 0 ? `${formattedSpecies}:${rest.join(":")}` : formattedSpecies;
    })
    .join("\n");
}

function getMixedOfferCounterRows(summary) {
  return getOfferSummaryLines(summary)
    .map((line, index) => {
      const rawLine = String(line || "").trim();
      if (!rawLine) return null;
      const speciesPart = (rawLine.split(":")[0] || rawLine).trim();
      const label = formatSpeciesForSale(speciesPart);
      const unit = getSpeciesPriceUnit(speciesPart);
      const kiloMatch = rawLine.match(/:\s*([0-9]+(?:[.,][0-9]+)?)\s*kg/i);
      const countMatch = rawLine.match(/\(([0-9]+(?:[.,][0-9]+)?)\s*kpl\)/i);
      const parsedWeight =
        parseLocaleNumber(kiloMatch?.[1]) ??
        parseLocaleNumber(countMatch?.[1]) ??
        0;
      return {
        key: `${speciesPart}-${index}`,
        label,
        unit,
        weight: Number.isFinite(parsedWeight) ? parsedWeight : 0,
      };
    })
    .filter(Boolean);
}

function getOfferSummaryBatchItems(summary) {
  return String(summary || "")
    .split("\n")
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .map((line) => {
      const batchMatch = line.match(/Erätunnus\s+([A-Z0-9-]+)/i);
      const catchDateMatch = line.match(/Pyyntipäivämäärä\s+([0-9]{4}-[0-9]{2}-[0-9]{2})/i);
      const label = line
        .replace(/\s*·\s*Hinta\s+.*$/i, "")
        .replace(/\s*·\s*Pyyntipäivämäärä\s+.*?(?=\s*·|$)/i, "")
        .replace(/\s*·\s*Erätunnus\s+.*$/i, "")
        .trim();
      return {
        label,
        catchDate: catchDateMatch ? String(catchDateMatch[1] || "").trim() : "",
        batchId: batchMatch ? String(batchMatch[1] || "").trim() : "",
      };
    })
    .filter((item) => item.label || item.batchId);
}

function getOfferSummaryCatchDates(summary) {
  return Array.from(
    new Set(
      getOfferSummaryBatchItems(summary)
        .map((item) => item.catchDate)
        .filter(Boolean)
    )
  );
}

function formatSourceBatchSummary(entry) {
  if (!entry) return "";
  const species = formatSpeciesForSale(entry.species);
  const kilos = entry.kilos == null || entry.kilos === "" ? "" : `${Number(entry.kilos).toFixed(1)} kg`;
  const count = entry.count == null || entry.count === "" ? "" : `${Number(entry.count)} kpl`;
  return [species, isCrayfishSpecies(entry.species) ? count : kilos, isCrayfishSpecies(entry.species) && kilos ? kilos : "", entry.batchId || ""].filter(Boolean).join(" · ");
}

function isMixedOffer(offer) {
  return getOfferSummaryLines(offer?.species_summary).length > 1;
}

function billingMatchesDelivery(fields) {
  return (
    String(fields?.deliveryAddress || "") === String(fields?.billingAddress || "") &&
    String(fields?.deliveryPostcode || "") === String(fields?.billingPostcode || "") &&
    String(fields?.deliveryCity || "") === String(fields?.billingCity || "")
  );
}

function billingMatchesAddress(fields) {
  return (
    String(fields?.address || "") === String(fields?.billingAddress || "") &&
    String(fields?.postcode || "") === String(fields?.billingPostcode || "") &&
    String(fields?.city || "") === String(fields?.billingCity || "")
  );
}

function buyerBillingMatchesDelivery(fields) {
  return (
    String(fields?.delivery_address || "") === String(fields?.billing_address || "") &&
    String(fields?.delivery_postcode || "") === String(fields?.billing_postcode || "") &&
    String(fields?.delivery_city || "") === String(fields?.billing_city || "")
  );
}

function inferLogisticsRegion(originCity, area) {
  const city = String(originCity || "").trim();
  if (city && municipalityRegionMap[city]) return municipalityRegionMap[city];

  const areaValue = String(area || "").toLowerCase();
  if (["saimaa", "puruvesi", "haukivesi", "pihlajavesi", "orivesi", "pyhäselkä", "luonteri", "kallavesi"].some((value) => areaValue.includes(value))) {
    return "east";
  }
  if (["suomenlahti", "saaristomeri", "selkämeri", "ahvenanmeri"].some((value) => areaValue.includes(value))) {
    return "south";
  }
  if (["perämeri", "oulujärvi", "inari", "kemijärvi"].some((value) => areaValue.includes(value))) {
    return "north";
  }
  if (["päijänne", "puula", "vesijärvi", "konnevesi", "keitele"].some((value) => areaValue.includes(value))) {
    return "central";
  }
  if (["näsijärvi", "pyhäjärvi", "vanajavesi", "kyrösjärvi", "lappajärvi"].some((value) => areaValue.includes(value))) {
    return "west";
  }
  return "south";
}

function getSuggestedDestinationCities(originCity, area) {
  const region = inferLogisticsRegion(originCity, area);
  const regionCities = logisticsRegionCities[region] || [];
  return Array.from(new Set([...alwaysSuggestedDestinationCities, ...regionCities]))
    .filter(Boolean)
    .slice(0, 10);
}

function getTransportModeLabel(mode) {
  if (mode === "terminal") return "Vie terminaaliin";
  if (mode === "pickup") return "Kuljetusfirma noutaa";
  if (mode === "collection_point") return "Vie keräilypisteeseen";
  return "-";
}

function getTransportPointType(mode) {
  if (mode === "terminal") return "terminal";
  if (mode === "collection_point") return "collection_point";
  return "";
}

function getAvailableOriginPoints(originCity, area, mode) {
  const targetType = getTransportPointType(mode);
  const region = inferLogisticsRegion(originCity, area);
  return pickupPoints
    .filter((point) => point.active && point.type === targetType && (point.region === region || point.city === originCity || point.region === "south"))
    .slice(0, 6);
}

function getOriginPointById(originPointId) {
  return pickupPoints.find((point) => point.id === originPointId) || null;
}

function getRoutePrice(originPointId, destinationCity, kilos) {
  const matched = routePrices.find((row) =>
    row.active &&
    row.origin_point_id === originPointId &&
    row.destination_city === destinationCity &&
    Number(kilos || 0) >= Number(row.min_kg || 0) &&
    Number(kilos || 0) <= Number(row.max_kg || Number.MAX_SAFE_INTEGER),
  );
  if (!matched) return null;
  const carrier = transportCompanies.find((company) => company.id === matched.carrier_id && company.active) || null;
  return {
    ...matched,
    carrier_name: carrier?.name || "",
  };
}

function getRouteOptionsForPoint(originPointId, kilos) {
  return routePrices
    .filter((row) =>
      row.active &&
      row.origin_point_id === originPointId &&
      Number(kilos || 0) >= Number(row.min_kg || 0) &&
      Number(kilos || 0) <= Number(row.max_kg || Number.MAX_SAFE_INTEGER),
    )
    .sort((a, b) => a.destination_city.localeCompare(b.destination_city, "fi"))
    .map((row) => ({
      ...row,
      carrier_name: transportCompanies.find((company) => company.id === row.carrier_id)?.name || "",
    }));
}

function getOfferProductTotal(rows) {
  return rows.reduce((sum, row) => {
    const price = Number(row.price_per_kg || 0);
    if (!Number.isFinite(price) || price <= 0) return sum;
    if (getSpeciesPriceUnit(getSpeciesRowLabel(row)) === "kpl") {
      return sum + Number(row.count || 0) * price;
    }
    return sum + Number(row.kilos || 0) * price;
  }, 0);
}

function getOptionalKgLimit(value) {
  if (value == null || value === "") return null;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return null;
  return numericValue;
}

function formatEntryPrice(rowOrSpecies, value) {
  const unit = getSpeciesPriceUnit(typeof rowOrSpecies === "string" ? rowOrSpecies : getSpeciesRowLabel(rowOrSpecies));
  if (value === "" || value == null) return "";
  return `${euro(value)} / ${unit}`;
}

function formatEntryGrossPrice(rowOrSpecies, value) {
  const grossPrice = calculateGrossPrice(value);
  if (grossPrice == null) return "";
  const unit = getSpeciesPriceUnit(typeof rowOrSpecies === "string" ? rowOrSpecies : getSpeciesRowLabel(rowOrSpecies));
  return `${euro(grossPrice)} / ${unit}`;
}

function formatNetAndGrossPriceLines(rowOrSpecies, value, vatRate = FISH_VAT_RATE) {
  if (value === "" || value == null) return [];
  const unit = getSpeciesPriceUnit(typeof rowOrSpecies === "string" ? rowOrSpecies : getSpeciesRowLabel(rowOrSpecies));
  const grossPrice = calculateGrossPrice(value, vatRate);
  if (grossPrice == null) return [];
  return [
    `Hinta ALV 0 %: ${euro(value)} / ${unit}`,
    `Hinta sis. ALV ${formatVatPercent(vatRate)} %: ${euro(grossPrice)} / ${unit}`,
  ];
}

function parsePricePerKgFromNotes(notes) {
  const match = String(notes || "").match(/Hinta:\s*([0-9]+(?:[.,][0-9]+)?)\s*€/i);
  if (!match) return "";
  const parsed = Number(String(match[1]).replace(",", "."));
  return Number.isNaN(parsed) ? "" : parsed;
}

function extractVisibleAdditionalNotes(notes) {
  const lines = String(notes || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return "";

  const cleaned = [];
  let inSpeciesBlock = false;
  for (const line of lines) {
    if (line === "Erän lajit:") {
      inSpeciesBlock = true;
      continue;
    }
    if (line === "Toimitus:") {
      inSpeciesBlock = false;
      continue;
    }
    if (inSpeciesBlock) continue;
    if (
      line.startsWith("Hinta:") ||
      line.startsWith("Hinta ALV 0 %") ||
      line.startsWith("Hinta sis. ALV") ||
      line === "Kilpailuta kuljetus: Ei" ||
      line.startsWith("Toimitustapa:") ||
      line.startsWith("Toimitusalue:") ||
      line.startsWith("Noutopaikka:") ||
      line.startsWith("Toimituskustannus:") ||
      line.startsWith("Aikaisin toimitus:") ||
      line.startsWith("Kylmäkuljetus:") ||
      line.startsWith("Kaupallisen kalastajan tunnus:") ||
      line.startsWith("Paikkakunta:")
    ) {
      continue;
    }
    cleaned.push(line);
  }

  return cleaned.join("\n");
}

function getBatchPublicUrl(batchId) {
  if (!batchId) return "";
  return `${getPublicAppBaseUrl()}/batch/${encodeURIComponent(batchId)}`;
}

function getBatchTraceValue(batchId) {
  if (!batchId) return "";
  return getBatchPublicUrl(batchId);
}

function getBatchQrImageUrl(batchId) {
  const traceValue = getBatchTraceValue(batchId);
  return traceValue ? `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(traceValue)}` : "";
}

function canPrintCatchLabels(entry) {
  return Boolean(entry?.batchId && entry?.species && entry?.date);
}

function isRoleAutomaticallyActive(role) {
  return role === "buyer" || role === "member";
}

function isFisherPremiumProfile(profileLike) {
  if (!profileLike) return false;
  if (profileLike.role !== "member") return true;
  return Boolean(profileLike.fisher_premium_enabled || profileLike.fisherPremiumEnabled);
}

function buildFisherPremiumMessage(featureLabel) {
  return `${featureLabel} kuuluu kalastajalisenssiin. Voit edelleen kirjata ja selata saaliita ilmaiseksi, mutta myynti, jäljitettävyystunnus, etikettien tulostus ja virallinen saalisilmoitus vaativat aktiivisen kalastajalisenssin.`;
}

const WATER_TYPE_FRESH = "makea";
const WATER_TYPE_SEA = "meri";
const OFFER_SEND_CONCURRENCY = 4;

function getCatchWaterTypeLabel(value) {
  return value === WATER_TYPE_SEA ? "Meri" : value === WATER_TYPE_FRESH ? "Makea vesi" : "";
}

function buildCatchProductionMethodText(waterType, catchArea) {
  const area = String(catchArea || "").trim();
  if (waterType === WATER_TYPE_FRESH) {
    return area ? `Pyydetty makeasta vedestä - Suomi, ${area}` : "Pyydetty makeasta vedestä";
  }
  if (waterType === WATER_TYPE_SEA) {
    return area ? `Pyydetty merestä - FAO 27, Itämeri (${area})` : "Pyydetty merestä - FAO 27, Itämeri";
  }
  return "";
}

function getCatchHarvestSourceText(waterType) {
  if (waterType === WATER_TYPE_FRESH) return "Pyydetty: makeasta vedestä";
  if (waterType === WATER_TYPE_SEA) return "Pyydetty: merestä";
  return "Pyydetty: tieto puuttuu";
}

function getCatchProductStateText() {
  return "Tuotteen tila: Tuore";
}

function isEntryOfferedForSale(entry) {
  return Boolean(
    entry?.offerToShops ||
    entry?.offerToRestaurants ||
    entry?.offerToWholesalers,
  );
}

function getCatchLabelScientificName(speciesValue) {
  const normalized = normalizeFishSpeciesLabel(speciesValue);
  if (fishSpeciesByName[normalized]?.scientific) {
    return fishSpeciesByName[normalized].scientific;
  }

  const labelTitle = formatSpeciesForLabelTitle(speciesValue);
  const normalizedTitle = normalizeFishSpeciesLabel(labelTitle);
  return fishSpeciesByName[normalizedTitle]?.scientific || "";
}

function getCatchLabelProductForm(speciesValue) {
  const normalized = normalizeSpeciesDisplayLabel(speciesValue);
  if (!normalized) return "";

  const metadata = getSpeciesMetadata(normalized);
  const baseSpecies = String(metadata?.name_fi || "").trim();
  if (!baseSpecies) return "";

  const suffix = normalized.slice(baseSpecies.length).trim();
  if (!suffix) return "";
  return suffix.startsWith(",") ? suffix.slice(1).trim() : suffix;
}

function buildCatchLabelData(entry, profileLike, boxNumber, totalBoxes, options = {}) {
  const species = formatSpeciesForLabelTitle(entry?.species || "");
  const scientificName = getCatchLabelScientificName(entry?.species);
  const productForm = getCatchLabelProductForm(entry?.species);
  const catchArea = [entry?.area, entry?.municipality, entry?.spot].filter(Boolean).join(" / ");
  const waterType = String(
    options?.waterType ||
    entry?.waterType ||
    profileLike?.water_type ||
    profileLike?.waterType ||
    "",
  ).trim();
  const supplierNameParts = [
    String(profileLike?.company_name || profileLike?.companyName || "").trim(),
    String(entry?.ownerName || profileLike?.display_name || "").trim(),
  ].filter(Boolean);
  const supplier = supplierNameParts.join(" / ") || String(entry?.ownerName || profileLike?.display_name || "").trim() || "-";
  const supplierAddress = [
    String(profileLike?.address || "").trim(),
    String(profileLike?.postcode || "").trim(),
    String(profileLike?.city || "").trim(),
  ].filter(Boolean).join(", ");
  const supplierContact = [
    String(profileLike?.contact_email || profileLike?.email || "").trim(),
    String(profileLike?.phone || "").trim(),
  ].filter(Boolean).join(" · ");
  const packDate = String(entry?.packDate || entry?.createdAt || "").slice(0, 10).trim();
  const weightText = entry?.kilos != null && String(entry.kilos).trim() !== ""
    ? `${Number(entry.kilos)} kg`
    : "";
  const boxLabel = `${boxNumber}/${totalBoxes}`;

  return {
    species,
    scientificName,
    batchId: String(entry?.batchId || "").trim(),
    commercialFishingId: String(entry?.commercialFishingId || profileLike?.commercial_fishing_id || profileLike?.commercialFishingId || "").trim(),
    catchDate: String(entry?.date || "").trim(),
    packDate,
    catchArea,
    gearType: String(entry?.gear || "").trim(),
    productForm,
    waterType,
    waterTypeLabel: getCatchWaterTypeLabel(waterType),
    productionMethodText: buildCatchProductionMethodText(waterType, catchArea),
    harvestSourceText: getCatchHarvestSourceText(waterType),
    productStateText: getCatchProductStateText(),
    weightText,
    supplier,
    supplierAddress,
    supplierContact,
    boxLabel,
  };
}

function getCatchLabelQrImageUrl(labelData) {
  const traceValue = getBatchTraceValue(labelData?.batchId);
  return traceValue
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(traceValue)}`
    : "";
}

function getProcessedLabelProductState(entry) {
  const explicitValue = String(
    entry?.productState ||
    entry?.product_state ||
    entry?.productStateText ||
    entry?.product_state_text ||
    "",
  ).trim();
  if (explicitValue) return explicitValue;

  const productType = String(entry?.productType || entry?.product_type || "").toLowerCase();
  const processingMethod = String(entry?.processingMethod || entry?.processing_method || "").toLowerCase();
  if (productType.includes("pakaste") || processingMethod.includes("pakast")) {
    return "Pakastettu";
  }
  return "";
}

function getProcessedLabelScientificName(entry) {
  const explicitValue = String(
    entry?.speciesNameScientific ||
    entry?.species_name_scientific ||
    "",
  ).trim();
  if (explicitValue) return explicitValue;

  const primarySpecies = String(
    entry?.speciesNameFi ||
    entry?.species_name_fi ||
    entry?.speciesSummary ||
    entry?.species_summary ||
    "",
  )
    .split("\n")[0]
    .split(",")[0]
    .trim();

  return getCatchLabelScientificName(primarySpecies);
}

const FINELI_API_BASE = "https://fineli.fi/fineli/api/v1";
const PROCESSED_NUTRITION_FIELDS = [
  { key: "energyKj", label: "Energia", unit: "kJ" },
  { key: "energyKcal", label: "Energia", unit: "kcal" },
  { key: "fat", label: "Rasva", unit: "g" },
  { key: "saturatedFat", label: "josta tyydyttynytta", unit: "g" },
  { key: "carbohydrate", label: "Hiilihydraatit", unit: "g" },
  { key: "sugars", label: "josta sokereita", unit: "g" },
  { key: "protein", label: "Proteiini", unit: "g" },
  { key: "salt", label: "Suola", unit: "g" },
];
const FINELI_COMPONENT_MATCHERS = {
  energyKj: [["energia", "kj"], ["energy", "kj"]],
  energyKcal: [["energia", "kcal"], ["energy", "kcal"]],
  fat: [["rasva"], ["fat"]],
  saturatedFat: [["tyydytt"], ["saturated"]],
  carbohydrate: [["hiilihydra"], ["carbohydrate"]],
  sugars: [["soker"], ["sugar"]],
  protein: [["protei"], ["protein"]],
  salt: [["suola"], ["salt"]],
  sodium: [["natrium"], ["sodium"]],
};
const PROCESSED_RECIPE_MANUAL_INGREDIENTS = {
  suola: {
    name: "Suola",
    nutrition: {
      energyKj: 0,
      energyKcal: 0,
      fat: 0,
      saturatedFat: 0,
      carbohydrate: 0,
      sugars: 0,
      protein: 0,
      salt: 100,
    },
  },
  vesi: {
    name: "Vesi",
    nutrition: {
      energyKj: 0,
      energyKcal: 0,
      fat: 0,
      saturatedFat: 0,
      carbohydrate: 0,
      sugars: 0,
      protein: 0,
      salt: 0,
    },
  },
  sokeri: {
    name: "Sokeri",
    nutrition: {
      energyKj: 1700,
      energyKcal: 400,
      fat: 0,
      saturatedFat: 0,
      carbohydrate: 100,
      sugars: 100,
      protein: 0,
      salt: 0,
    },
  },
};

let fineliComponentsPromise = null;
const fineliFoodDetailCache = new Map();

function createEmptyProcessedManualNutrition(seed = {}) {
  return {
    energyKj: seed.energyKj === "" || seed.energyKj == null ? "" : String(seed.energyKj),
    energyKcal: seed.energyKcal === "" || seed.energyKcal == null ? "" : String(seed.energyKcal),
    fat: seed.fat === "" || seed.fat == null ? "" : String(seed.fat),
    saturatedFat: seed.saturatedFat === "" || seed.saturatedFat == null ? "" : String(seed.saturatedFat),
    carbohydrate: seed.carbohydrate === "" || seed.carbohydrate == null ? "" : String(seed.carbohydrate),
    sugars: seed.sugars === "" || seed.sugars == null ? "" : String(seed.sugars),
    protein: seed.protein === "" || seed.protein == null ? "" : String(seed.protein),
    salt: seed.salt === "" || seed.salt == null ? "" : String(seed.salt),
  };
}

function createProcessedRecipeRow(seed = {}) {
  const manualNutritionSeed = seed.manualNutrition || seed.manual_nutrition || {};
  return {
    id: seed.id || safeId(),
    ingredientName: String(seed.ingredientName || seed.ingredient_name || seed.fineliFoodName || "").trim(),
    percentage: seed.percentage === "" || seed.percentage == null ? "" : String(seed.percentage),
    fineliFoodId: String(seed.fineliFoodId || seed.fineli_food_id || "").trim(),
    fineliFoodName: String(seed.fineliFoodName || seed.fineli_food_name || "").trim(),
    fineliNutrients: seed.fineliNutrients || seed.fineli_nutrients || null,
    nutritionMode: String(seed.nutritionMode || seed.nutrition_mode || (Object.keys(manualNutritionSeed).length > 0 ? "manual" : "fineli")).trim() || "fineli",
    manualNutrition: createEmptyProcessedManualNutrition(manualNutritionSeed),
    searchResults: [],
    searchLoading: false,
    searchError: "",
  };
}

function getProcessedManualIngredientPreset(name) {
  const normalized = normalizeFineliText(name);
  if (!normalized) return null;
  if (normalized === "suola" || normalized === "merisuola" || normalized === "hienosuola" || normalized === "kivisuola") {
    return PROCESSED_RECIPE_MANUAL_INGREDIENTS.suola;
  }
  if (normalized === "vesi") {
    return PROCESSED_RECIPE_MANUAL_INGREDIENTS.vesi;
  }
  if (normalized === "sokeri" || normalized === "kidesokeri") {
    return PROCESSED_RECIPE_MANUAL_INGREDIENTS.sokeri;
  }
  return null;
}

function normalizeFineliText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function collectFineliStrings(input, depth = 2, seen = new Set()) {
  if (input == null || depth < 0) return [];
  if (typeof input === "string" || typeof input === "number" || typeof input === "boolean") {
    return [String(input)];
  }
  if (typeof input !== "object") return [];
  if (seen.has(input)) return [];
  seen.add(input);

  const values = [];
  if (Array.isArray(input)) {
    input.forEach((item) => {
      values.push(...collectFineliStrings(item, depth - 1, seen));
    });
    return values;
  }

  Object.values(input).forEach((value) => {
    values.push(...collectFineliStrings(value, depth - 1, seen));
  });
  return values;
}

function extractFineliFoodId(item) {
  const candidates = [
    item?.id,
    item?.foodId,
    item?.food_id,
    item?.food?.id,
    item?.food?.foodId,
    item?.food?.food_id,
  ];
  const found = candidates.find((value) => value != null && value !== "");
  return found == null ? "" : String(found).trim();
}

function extractFineliFoodName(item) {
  const candidates = [
    item?.name,
    item?.nameFi,
    item?.name_fi,
    item?.foodName,
    item?.food_name,
    item?.shortName,
    item?.short_name,
    item?.description,
    item?.food?.name,
    item?.food?.nameFi,
    item?.food?.name_fi,
  ];
  const found = candidates.find((value) => {
    if (typeof value === "string") return value.trim();
    if (value && typeof value === "object") return collectFineliStrings(value, 1).some((entry) => String(entry || "").trim());
    return String(value || "").trim();
  });
  if (typeof found === "string") return found.trim();
  if (found && typeof found === "object") {
    const objectValues = collectFineliStrings(found, 2)
      .map((entry) => String(entry || "").trim())
      .filter(Boolean);
    return objectValues[0] || "";
  }
  return String(found || "").trim();
}

function parseFineliNumeric(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value).replace(",", ".").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractFineliEntryValue(entry) {
  const directCandidates = [
    entry?.value,
    entry?.amount,
    entry?.componentValue,
    entry?.component_value,
    entry?.foodComponentValue,
    entry?.food_component_value,
    entry?.quantity,
    entry?.quantityValue,
    entry?.quantity_value,
    entry?.numericValue,
    entry?.numeric_value,
    entry?.bestLocationValue,
    entry?.best_location_value,
    entry?.calculatedValue,
    entry?.calculated_value,
    entry?.median,
    entry?.mean,
    entry?.component?.value,
    entry?.component?.amount,
  ];
  for (const candidate of directCandidates) {
    const parsed = parseFineliNumeric(candidate);
    if (parsed != null) return parsed;
  }
  return null;
}

function matchesFineliKeywords(text, keywordGroups) {
  return keywordGroups.some((keywords) => keywords.every((keyword) => text.includes(keyword)));
}

async function fetchFineliComponents() {
  if (!fineliComponentsPromise) {
    fineliComponentsPromise = fetch(`${FINELI_API_BASE}/components`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Fineli-komponenttien haku epäonnistui (${response.status})`);
        }
        return response.json();
      })
      .then((payload) => {
        if (Array.isArray(payload)) return payload;
        if (Array.isArray(payload?.data)) return payload.data;
        if (Array.isArray(payload?.components)) return payload.components;
        return [];
      })
      .catch((error) => {
        fineliComponentsPromise = null;
        throw error;
      });
  }
  return fineliComponentsPromise;
}

function resolveFineliComponentIds(components) {
  return Object.entries(FINELI_COMPONENT_MATCHERS).reduce((acc, [key, keywordGroups]) => {
    const ids = components
      .filter((item) => {
        const text = normalizeFineliText(collectFineliStrings(item, 2).join(" "));
        return text && matchesFineliKeywords(text, keywordGroups);
      })
      .map((item) => {
        const idCandidate = item?.id ?? item?.componentId ?? item?.component_id ?? item?.value;
        return idCandidate == null ? null : String(idCandidate).trim();
      })
      .filter(Boolean);
    acc[key] = ids;
    return acc;
  }, {});
}

function extractFineliFoodRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.foods)) return payload.foods;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function extractFineliComponentEntries(foodPayload) {
  const candidates = [
    foodPayload?.componentValues,
    foodPayload?.component_values,
    foodPayload?.components,
    foodPayload?.componentvalues,
    foodPayload?.values,
    foodPayload?.nutrients,
    foodPayload?.food?.componentValues,
    foodPayload?.food?.component_values,
    foodPayload?.food?.components,
    foodPayload?.food?.values,
    foodPayload?.food?.nutrients,
  ];
  return candidates.find(Array.isArray) || [];
}

function extractNutritionSnapshotFromFineliFood(foodPayload, componentIdsByKey) {
  const directSaltValue = parseFineliNumeric(foodPayload?.salt);
  const normalizedDirectSaltValue = directSaltValue != null && directSaltValue > 100 ? directSaltValue / 1000 : directSaltValue;
  const directSnapshot = {
    energyKj: parseFineliNumeric(foodPayload?.energy),
    energyKcal: parseFineliNumeric(foodPayload?.energyKcal ?? foodPayload?.energyKcalValue),
    fat: parseFineliNumeric(foodPayload?.fat),
    saturatedFat: parseFineliNumeric(foodPayload?.saturatedFat ?? foodPayload?.saturated_fat),
    carbohydrate: parseFineliNumeric(foodPayload?.carbohydrate),
    sugars: parseFineliNumeric(foodPayload?.sugar ?? foodPayload?.sugars),
    protein: parseFineliNumeric(foodPayload?.protein),
    salt: normalizedDirectSaltValue,
  };
  const hasDirectValues = Object.values(directSnapshot).some((value) => value != null);
  if (hasDirectValues) {
    return directSnapshot;
  }

  const entries = extractFineliComponentEntries(foodPayload).map((entry) => ({
    id: String(
      entry?.componentId ??
      entry?.component_id ??
      entry?.component?.id ??
      entry?.component?.componentId ??
      entry?.component?.component_id ??
      entry?.id ??
      "",
    ).trim(),
    text: normalizeFineliText(collectFineliStrings(entry, 2).join(" ")),
    value: extractFineliEntryValue(entry),
  }));

  const findComponentValue = (key) => {
    const ids = componentIdsByKey[key] || [];
    const matcherGroups = FINELI_COMPONENT_MATCHERS[key] || [];
    const match = entries.find((entry) => entry.value != null && (
      (ids.length > 0 && entry.id && ids.includes(entry.id)) ||
      (entry.text && matchesFineliKeywords(entry.text, matcherGroups))
    ));
    return match?.value ?? null;
  };

  const sodiumValue = findComponentValue("sodium");
  const explicitSalt = findComponentValue("salt");
  return {
    energyKj: findComponentValue("energyKj"),
    energyKcal: findComponentValue("energyKcal"),
    fat: findComponentValue("fat"),
    saturatedFat: findComponentValue("saturatedFat"),
    carbohydrate: findComponentValue("carbohydrate"),
    sugars: findComponentValue("sugars"),
    protein: findComponentValue("protein"),
    salt: explicitSalt != null ? explicitSalt : (sodiumValue != null ? sodiumValue * 2.5 : null),
  };
}

function buildProcessedRecipePayload(rows) {
  return rows
    .map((row) => ({
      ingredient_name: String(row.ingredientName || "").trim(),
      percentage: parseFineliNumeric(row.percentage),
      fineli_food_id: String(row.fineliFoodId || "").trim() || null,
      fineli_food_name: String(row.fineliFoodName || "").trim() || null,
      fineli_nutrients: row.fineliNutrients || null,
      nutrition_mode: row.nutritionMode === "manual" ? "manual" : "fineli",
      manual_nutrition: row.nutritionMode === "manual"
        ? PROCESSED_NUTRITION_FIELDS.reduce((acc, field) => {
            const parsed = parseFineliNumeric(row.manualNutrition?.[field.key]);
            acc[field.key] = parsed == null ? null : parsed;
            return acc;
          }, {})
        : null,
    }))
    .filter((row) => row.ingredient_name || row.percentage != null || row.fineli_food_id || row.fineli_food_name || row.nutrition_mode === "manual");
}

function calculateProcessedNutritionPer100g(rows) {
  const normalizedRows = rows
    .map((row) => ({
      ingredientName: String(row.ingredientName || "").trim(),
      percentage: parseFineliNumeric(row.percentage),
      nutrients: row.nutritionMode === "manual"
        ? PROCESSED_NUTRITION_FIELDS.reduce((acc, field) => {
            const parsed = parseFineliNumeric(row.manualNutrition?.[field.key]);
            acc[field.key] = parsed == null ? null : parsed;
            return acc;
          }, {})
        : (row.fineliNutrients || null),
      selected: row.nutritionMode === "manual"
        ? PROCESSED_NUTRITION_FIELDS.some((field) => parseFineliNumeric(row.manualNutrition?.[field.key]) != null)
        : Boolean(String(row.fineliFoodId || "").trim()),
    }))
    .filter((row) => row.ingredientName || row.percentage != null || row.selected);

  if (normalizedRows.length === 0) {
    return { nutrition: null, totalPercentage: 0, complete: false, hasRows: false };
  }

  const rowsWithPercentage = normalizedRows.filter((row) => row.percentage != null && row.percentage > 0);
  const totalPercentage = rowsWithPercentage.reduce((sum, row) => sum + Number(row.percentage || 0), 0);
  const incomplete = rowsWithPercentage.some((row) => !row.selected || !row.nutrients);

  if (rowsWithPercentage.length === 0 || totalPercentage <= 0 || incomplete) {
    return { nutrition: null, totalPercentage, complete: false, hasRows: true };
  }

  const nutrition = PROCESSED_NUTRITION_FIELDS.reduce((acc, field) => {
    const total = rowsWithPercentage.reduce((sum, row) => {
      const value = parseFineliNumeric(row.nutrients?.[field.key]);
      return sum + ((value == null ? 0 : value) * Number(row.percentage || 0));
    }, 0);
    acc[field.key] = total / totalPercentage;
    return acc;
  }, {});

  return { nutrition, totalPercentage, complete: true, hasRows: true };
}

function formatProcessedNutritionValue(key, value) {
  const parsed = parseFineliNumeric(value);
  if (parsed == null) return "";
  if (key === "energyKj" || key === "energyKcal") return String(Math.round(parsed));
  return parsed.toLocaleString("fi-FI", {
    minimumFractionDigits: parsed < 10 ? 1 : 0,
    maximumFractionDigits: 1,
  });
}

function getProcessedStrongSaltWarning(entry) {
  const saltValue = parseFineliNumeric(entry?.nutritionPer100g?.salt ?? entry?.nutrition_per_100g?.salt);
  if (saltValue == null) return "";
  return saltValue > 1.8 ? "Voimakassuolainen" : "";
}

function buildProcessedNutritionRows(nutrition) {
  if (!nutrition || typeof nutrition !== "object") return [];
  return PROCESSED_NUTRITION_FIELDS
    .map((field) => ({
      key: field.key,
      label: field.label,
      unit: field.unit,
      value: formatProcessedNutritionValue(field.key, nutrition[field.key]),
    }))
    .filter((row) => row.value);
}

async function searchFineliFoodsByQuery(query) {
  const response = await fetch(`${FINELI_API_BASE}/foods?q=${encodeURIComponent(query)}`);
  if (!response.ok) {
    throw new Error(`Fineli-haku epäonnistui (${response.status})`);
  }
  const payload = await response.json();
  return extractFineliFoodRows(payload)
    .map((item) => ({
      id: extractFineliFoodId(item),
      name: extractFineliFoodName(item),
    }))
    .filter((item) => item.id && item.name)
    .slice(0, 12);
}

async function fetchFineliFoodNutrition(foodId) {
  if (fineliFoodDetailCache.has(foodId)) {
    return fineliFoodDetailCache.get(foodId);
  }

  const promise = Promise.all([
    fetch(`${FINELI_API_BASE}/foods/${encodeURIComponent(foodId)}`),
    fetchFineliComponents(),
  ]).then(async ([foodResponse, components]) => {
    if (!foodResponse.ok) {
      throw new Error(`Fineli-tuotteen haku epäonnistui (${foodResponse.status})`);
    }
    const foodPayload = await foodResponse.json();
    const componentIdsByKey = resolveFineliComponentIds(components);
    return extractNutritionSnapshotFromFineliFood(foodPayload, componentIdsByKey);
  }).catch((error) => {
    fineliFoodDetailCache.delete(foodId);
    throw error;
  });

  fineliFoodDetailCache.set(foodId, promise);
  return promise;
}

function buildProcessedProductPayload(formState, ownerUserId, recipeItems = [], nutritionPer100g = null) {
  return {
    owner_user_id: ownerUserId,
    template_name: String(formState.productName || formState.productType || "Oma tuote").trim(),
    area: formState.area || "Saimaa",
    municipality: formState.municipality || "",
    origin_city: formState.originCity || formState.municipality || "",
    spot: formState.spot || "",
    product_name: String(formState.productName || "").trim(),
    product_type: formState.productType || "",
    processing_method: formState.processingMethod || "",
    product_state: formState.productState || null,
    species_name_fi: String(formState.speciesNameFi || "").trim() || null,
    species_name_scientific: String(formState.speciesNameScientific || "").trim() || null,
    gear_type: String(formState.gearType || "").trim() || null,
    species_summary: String(formState.speciesSummary || "").trim() || null,
    ingredients: String(formState.ingredients || "").trim() || null,
    allergens: String(formState.allergens || "").trim() || null,
    storage_temperature: String(formState.storageTemperature || "").trim() || null,
    storage_instructions: String(formState.storageInstructions || "").trim() || null,
    recipe_items: recipeItems.length > 0 ? recipeItems : null,
    nutrition_per_100g: nutritionPer100g || null,
    package_size_g: formState.packageSizeG === "" ? null : Number(formState.packageSizeG),
    notes: String(formState.notes || "").trim() || null,
  };
}

function buildProcessedLabelData(entry, profileLike) {
  const operatorStreet = String(
    profileLike?.address ||
    profileLike?.billing_address ||
    profileLike?.billingAddress ||
    "",
  ).trim();
  const operatorPostcode = String(
    profileLike?.postcode ||
    profileLike?.billing_postcode ||
    profileLike?.billingPostcode ||
    "",
  ).trim();
  const operatorCity = String(
    profileLike?.city ||
    profileLike?.billing_city ||
    profileLike?.billingCity ||
    "",
  ).trim();
  const operatorName = String(
    profileLike?.company_name ||
    profileLike?.companyName ||
    profileLike?.display_name ||
    profileLike?.displayName ||
    profileLike?.email ||
    "",
  ).trim();
  const operatorAddress = [
    operatorStreet,
    [operatorPostcode, operatorCity].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ");
  const operatorEmail = String(
    profileLike?.contact_email ||
    profileLike?.contactEmail ||
    profileLike?.email ||
    "",
  ).trim();
  const establishmentNumber = String(
    profileLike?.evira_facility_id ||
    profileLike?.eviraFacilityId ||
    "",
  ).trim();
  if (!establishmentNumber) {
    console.warn("Processed label missing evira_facility_id", {
      profileId: profileLike?.id || null,
      batchId: entry?.batchId || null,
    });
  }

  const packageSizeG = entry?.packageSizeG === "" || entry?.packageSizeG == null ? null : Number(entry.packageSizeG);
  const kilos = entry?.kilos === "" || entry?.kilos == null ? null : Number(entry.kilos);
  const netWeightText = packageSizeG != null && Number.isFinite(packageSizeG)
    ? `${packageSizeG} g`
    : kilos != null && Number.isFinite(kilos)
      ? `${kilos} kg`
      : "";

  const dateValue = String(entry?.useByDate || entry?.use_by_date || entry?.bestBeforeDate || entry?.best_before_date || "").trim();
  const dateLabel = String(entry?.useByDate || entry?.use_by_date || "").trim() ? "Viimeinen kayttopaiva" : "Parasta ennen";
  const catchAreaText = [entry?.area, entry?.municipality, entry?.spot].filter(Boolean).join(" / ");

  return {
    productName: String(entry?.productName || entry?.product_name || "").trim(),
    speciesSummary: String(entry?.speciesSummary || entry?.species_summary || "").trim(),
    productType: String(entry?.productType || entry?.product_type || "").trim(),
    processingMethod: String(entry?.processingMethod || entry?.processing_method || "").trim(),
    netWeightText,
    dateLabel,
    dateValue,
    storageTemperatureText: String(entry?.storageTemperature || entry?.storage_temperature || "").trim(),
    storageText: String(entry?.storageInstructions || entry?.storage_instructions || entry?.storageText || "").trim(),
    batchId: String(entry?.batchId || entry?.batch_id || "").trim(),
    operatorName,
    operatorAddress,
    operatorEmail,
    establishmentNumber,
    catchAreaText,
    speciesNameFi: String(entry?.speciesNameFi || entry?.species_name_fi || "").trim(),
    speciesNameScientific: getProcessedLabelScientificName(entry),
    gearType: String(entry?.gearType || entry?.gear_type || "").trim(),
    productStateText: getProcessedLabelProductState(entry),
    strongSaltWarningText: getProcessedStrongSaltWarning(entry),
    ingredientsText: String(entry?.ingredients || entry?.ingredientsText || "").trim(),
    allergensText: String(entry?.allergens || entry?.allergensText || "").trim(),
    nutritionRows: buildProcessedNutritionRows(entry?.nutritionPer100g || entry?.nutrition_per_100g || null),
    qrImageUrl: entry?.batchId ? getBatchQrImageUrl(entry.batchId) : "",
    logoUrl: getAppLogoUrl(),
  };
}

function renderProcessedLabelByFormat(printFormat, label) {
  if (printFormat === PROCESSED_LABEL_FORMAT_4X3) {
    return <ProcessedLabel4x3 label={label} />;
  }
  return <ProcessedLabel4x6 label={label} />;
}

function getProcessedLabelSizeMm(printFormat) {
  if (printFormat === PROCESSED_LABEL_FORMAT_4X3) return PROCESSED_LABEL_4X3_SIZE_MM;
  return PROCESSED_LABEL_4X6_SIZE_MM;
}

function getAppLogoUrl() {
  if (typeof window === "undefined") return "/logo.png";
  return new URL("/logo.png", window.location.origin).toString();
}

function createInitialProcessedForm() {
  const storedCatchDefaults = getStoredCatchFormDefaults();
  return {
    productionDate: today(),
    bestBeforeDate: "",
    useByDate: "",
    area: "Saimaa",
    municipality: "",
    originCity: "",
    spot: "",
    productName: "",
    productType: "Filee",
    processingMethod: "Fileointi",
    productState: "",
    speciesNameFi: "",
    speciesNameScientific: "",
    gearType: "",
    speciesSummary: "",
    ingredients: "",
    allergens: "",
    storageTemperature: "",
    storageInstructions: "",
    kilos: "",
    packageSizeG: "",
    packageCount: "",
    notes: "",
    listForSale: false,
    offerToShops: false,
    offerToRestaurants: false,
    offerToWholesalers: false,
    deliveryPossible: false,
    deliveryMethod: "Myyjä toimittaa",
    transportMode: "",
    originPointId: "",
    transportCompanyId: "north-fresh-logistics",
    pickupAddress: "",
    pickupSurcharge: "",
    estimatedPickupTime: "",
    pickupPostal: "",
    deliveryAddress: "",
    deliveryPostal: "",
    palletType: "EUR-lava",
    palletCount: "1",
    tailLift: false,
    pickupWindow: "",
    deliveryWindow: "",
    transportNotes: "",
    deliveryDestinations: storedCatchDefaults.deliveryDestinations || [],
    deliveryArea: storedCatchDefaults.deliveryArea || "",
    deliveryCost: "",
    earliestDeliveryDate: today(),
    coldTransport: true,
    sourceEntryIds: [],
  };
}

const CATCH_LABEL_FORMAT_APLI_1278 = "apli_1278";
const CATCH_LABEL_FORMAT_MUNBYN_4X3 = "munbyn_4x3";
const CATCH_LABEL_FORMAT_MUNBYN_4X6 = "munbyn_4x6";
const PROCESSED_LABEL_FORMAT_4X3 = "processed_4x3";
const PROCESSED_LABEL_FORMAT_4X6 = "processed_4x6";

function isThermalCatchLabelFormat(printFormat) {
  return printFormat === CATCH_LABEL_FORMAT_MUNBYN_4X6 || printFormat === CATCH_LABEL_FORMAT_MUNBYN_4X3;
}

function getThermalLabelSizeMm(printFormat) {
  if (printFormat === CATCH_LABEL_FORMAT_MUNBYN_4X3) return THERMAL_LABEL_4X3_SIZE_MM;
  return THERMAL_LABEL_4X6_SIZE_MM;
}

function renderThermalLabelByFormat(printFormat, label) {
  if (printFormat === CATCH_LABEL_FORMAT_MUNBYN_4X3) {
    return <ThermalLabel4x3 label={label} />;
  }
  return <ThermalLabel4x6Portrait label={label} />;
}

const CATCH_LABEL_FORMATS = [
  {
    value: CATCH_LABEL_FORMAT_MUNBYN_4X6,
    label: "MUNBYN 4x6",
    description: "102 × 152 mm · 1 etiketti / sivu",
  },
  {
    value: CATCH_LABEL_FORMAT_MUNBYN_4X3,
    label: "MUNBYN 4x3",
    description: "101.6 × 76.2 mm · 1 etiketti / sivu",
  },
  {
    value: CATCH_LABEL_FORMAT_APLI_1278,
    label: "APLI 1278",
    description: "57 × 105 mm · 10 etikettiä / arkki",
  },
];

function buildCatchLabelPrintHtml(entry, profileLike, labelCount, printFormat = CATCH_LABEL_FORMAT_APLI_1278) {
  const count = Math.max(1, Number(labelCount || 1));
  const labels = Array.from({ length: count }, (_, index) => {
    const labelData = buildCatchLabelData(entry, profileLike, index + 1, count);
    return {
      ...labelData,
      qrImageUrl: getCatchLabelQrImageUrl(labelData),
      logoUrl: getAppLogoUrl(),
    };
  });

  if (isThermalCatchLabelFormat(printFormat)) {
    const thermalSize = getThermalLabelSizeMm(printFormat);
    return `
      <!doctype html>
      <html lang="fi">
        <head>
          <meta charset="utf-8" />
          <title>Kalaetiketit ${String(entry?.batchId || "")}</title>
          <style>
            @page { size: ${thermalSize.width}mm ${thermalSize.height}mm; margin: 0; }
            html, body { width: ${thermalSize.width}mm; height: ${thermalSize.height}mm; margin: 0; padding: 0; overflow: hidden; box-sizing: border-box; background: #fff; }
            * { box-sizing: border-box; }
            .thermal-label-page { page-break-after: always; }
            .thermal-label-page:last-child { page-break-after: auto; }
          </style>
        </head>
        <body>${labels.map((label) => `<section class="thermal-label-page">${renderToStaticMarkup(renderThermalLabelByFormat(printFormat, label))}</section>`).join("")}</body>
      </html>
    `;
  }

  const pages = [];
  for (let index = 0; index < labels.length; index += 10) {
    pages.push(labels.slice(index, index + 10));
  }

  const renderLabel = (label) => `
    <div class="label">
      <div class="label-inner">
        <div class="label-main">
          <div class="label-main-top">
            <div class="species">${label.species || "-"}</div>
            ${label.scientificName ? `<div class="scientific">${label.scientificName}</div>` : ""}
            <div class="batch">Erätunnus: ${label.batchId || "-"}</div>
          ${label.catchArea ? `<div class="line">Pyyntialue: ${label.catchArea}</div>` : ""}
          ${label.harvestSourceText ? `<div class="line">${label.harvestSourceText}</div>` : ""}
          ${label.gearType ? `<div class="line">Pyyntimenetelmä: ${label.gearType}</div>` : ""}
          ${label.productStateText ? `<div class="line">${label.productStateText}</div>` : ""}
          ${label.catchDate ? `<div class="line catch-date">Pyyntipäivä: ${label.catchDate}</div>` : ""}
          ${label.commercialFishingId ? `<div class="line">Kaupallisen kalastajan tunnus: ${label.commercialFishingId}</div>` : ""}
          ${label.productForm ? `<div class="line">Tuote: ${label.productForm}</div>` : ""}
          <div class="line">Säilytys: 0–2 °C</div>
        </div>
          <div class="weight-line"><span class="weight-label">Paino:</span><span class="weight-write"></span><span class="weight-unit">kg</span></div>
          <div class="supplier-block">
            <div class="line">Toimittaja: ${label.supplier || "-"}</div>
            ${label.supplierAddress ? `<div class="line">${label.supplierAddress}</div>` : ""}
            ${label.supplierContact ? `<div class="line">${label.supplierContact}</div>` : ""}
          </div>
        </div>
        <div class="label-side">
          <div class="label-brand">
            <img src="${label.logoUrl}" alt="Suoraan Kalastajalta" />
            <div class="label-brand-text">
              <div>Suoraan</div>
              <div>Kalastajalta</div>
            </div>
          </div>
          <div class="label-qr">
            <img src="${label.qrImageUrl}" alt="QR ${label.batchId}" />
          </div>
        </div>
      </div>
    </div>
  `;

  return `
    <!doctype html>
    <html lang="fi">
      <head>
        <meta charset="utf-8" />
        <title>Kalaetiketit ${String(entry?.batchId || "")}</title>
        <style>
          @page { size: A4 portrait; margin: 4mm 0 4mm 0; }
          * { box-sizing: border-box; }
          body { margin: 0; font-family: Inter, Arial, sans-serif; background: #fff; color: #111827; }
          .sheet { width: 210mm; height: 289mm; margin: 0 auto; display: grid; grid-template-columns: 105mm 105mm; grid-template-rows: repeat(5, 56.4mm); gap: 0; align-content: start; }
          .page-break { page-break-after: always; }
          .label { width: 105mm; height: 56.4mm; padding: 1.8mm 2.6mm; }
          .label-inner { width: 100%; height: 100%; padding: 1.8mm; display: grid; grid-template-columns: 1fr 27mm; gap: 1.8mm; overflow: hidden; }
          .label-main { height: 100%; padding-left: 3mm; display: flex; flex-direction: column; min-width: 0; }
          .label-main-top { min-width: 0; }
          .supplier-block { margin-top: auto; min-width: 0; }
          .species { font-size: 12.6pt; font-weight: 800; line-height: 1.03; margin-bottom: 0.45mm; }
          .scientific { font-size: 6.2pt; line-height: 1.12; color: #475569; margin-bottom: 0.7mm; }
          .batch { font-size: 7.2pt; font-weight: 800; background: #eff6ff; border: 0.22mm solid #93c5fd; border-radius: 1.2mm; padding: 0.7mm 0.9mm; margin-bottom: 0.7mm; }
          .line { font-size: 6.25pt; line-height: 1.12; margin-bottom: 0.3mm; }
          .catch-date { font-size: 7.4pt; line-height: 1.16; font-weight: 700; margin-bottom: 0.5mm; }
          .weight-line { display: flex; align-items: flex-end; gap: 1.1mm; font-size: 6.5pt; margin: 1.25mm 0 0.35mm; min-height: 4.8mm; }
          .weight-label { font-weight: 700; white-space: nowrap; }
          .weight-write { flex: 1; min-width: 0; border-bottom: 0.45mm solid #0f172a; height: 3.1mm; }
          .weight-unit { font-weight: 700; white-space: nowrap; }
          .label-side { display: flex; flex-direction: column; justify-content: space-between; align-items: flex-start; min-width: 0; }
          .label-brand { display: flex; flex-direction: column; align-items: center; width: 100%; padding-top: 0.6mm; }
          .label-brand img { width: 14.4mm; max-height: 12mm; object-fit: contain; margin-bottom: 0.6mm; }
          .label-brand-text { font-size: 5.2pt; line-height: 1.05; font-weight: 700; text-align: center; color: #0f172a; }
          .label-qr { display: flex; align-items: flex-end; justify-content: flex-start; width: 100%; }
          .label-qr img { width: 18mm; height: 18mm; object-fit: contain; border: 0.22mm solid #cbd5e1; border-radius: 1.2mm; padding: 0.8mm; background: #fff; }
        </style>
      </head>
      <body>
        ${pages.map((page, pageIndex) => `<div class="sheet ${pageIndex < pages.length - 1 ? "page-break" : ""}">${page.map((label) => renderLabel(label)).join("")}</div>`).join("")}
      </body>
    </html>
  `;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Tiedoston muunto data-URL:ksi epäonnistui."));
    reader.readAsDataURL(blob);
  });
}

function isNativeCapacitorApp() {
  if (typeof window === "undefined") return false;
  const maybeCapacitor = window.Capacitor;
  if (!maybeCapacitor) return false;
  if (typeof maybeCapacitor.isNativePlatform === "function") {
    return maybeCapacitor.isNativePlatform();
  }
  if (typeof maybeCapacitor.getPlatform === "function") {
    return maybeCapacitor.getPlatform() !== "web";
  }
  return false;
}

let lastPresentedPdfKey = "";
let lastPresentedPdfAt = 0;

function shouldSkipDuplicateFilePresentation(fileName) {
  const presentationKey = String(fileName || "document");
  const now = Date.now();
  if (presentationKey === lastPresentedPdfKey && now - lastPresentedPdfAt < 1500) {
    return true;
  }
  lastPresentedPdfKey = presentationKey;
  lastPresentedPdfAt = now;
  return false;
}

function isShareCancelledError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("share canceled") ||
    message.includes("share cancelled") ||
    message.includes("user canceled") ||
    message.includes("user cancelled") ||
    message.includes("cancelled") ||
    message.includes("canceled");
}

let foregroundNotificationAudioContext = null;

async function triggerForegroundNotificationFeedback() {
  if (typeof window === "undefined") return;

  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([0, 180, 90, 240]);
    }
  } catch {
    // ignore vibration failures
  }

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!foregroundNotificationAudioContext) {
      foregroundNotificationAudioContext = new AudioContextClass();
    }

    const context = foregroundNotificationAudioContext;
    if (context.state === "suspended") {
      await context.resume();
    }

    const startAt = context.currentTime + 0.02;
    const gainNode = context.createGain();
    const oscillator = context.createOscillator();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(932, startAt);
    oscillator.frequency.exponentialRampToValueAtTime(740, startAt + 0.16);

    gainNode.gain.setValueAtTime(0.0001, startAt);
    gainNode.gain.exponentialRampToValueAtTime(0.09, startAt + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.22);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + 0.24);
  } catch {
    // ignore foreground audio failures
  }
}

async function presentFileBlob(blob, fileName, options = {}) {
  if (typeof window === "undefined") return;
  const presentationKey = options.skipDuplicateGuard
    ? ""
    : String(options.dedupeKey || fileName || "");
  if (presentationKey && shouldSkipDuplicateFilePresentation(presentationKey)) return;

  const mimeType = String(options.mimeType || blob?.type || "application/octet-stream");
  const browserAction = options.browserAction === "open" ? "open" : "download";
  const nativeFileName = String(options.nativeFileName || fileName || "document");

  if (isNativeCapacitorApp()) {
    const dataUrl = await blobToDataUrl(blob);
    const base64Data = String(dataUrl || "").split(",")[1] || "";
    if (!base64Data) {
      throw new Error("Tiedoston muodostus epäonnistui.");
    }

    const { uri } = await Filesystem.writeFile({
      path: nativeFileName,
      data: base64Data,
      directory: Directory.Cache,
      recursive: true,
    });

    try {
      await Share.share({
        title: String(options.shareTitle || fileName),
        text: String(options.shareText || "Avaa tai jaa tiedosto"),
        url: uri,
        dialogTitle: String(options.dialogTitle || fileName),
      });
    } catch (error) {
      if (isShareCancelledError(error)) {
        return;
      }
      throw error;
    }
    return;
  }

  const blobUrl = URL.createObjectURL(new Blob([blob], { type: mimeType }));
  if (browserAction === "open") {
    const openedWindow = window.open(blobUrl, "_blank", "noopener,noreferrer");
    if (!openedWindow) {
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  } else {
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  window.setTimeout(() => {
    try {
      URL.revokeObjectURL(blobUrl);
    } catch {
      // ignore cleanup failure
    }
  }, 60000);
}

async function presentPdfDocument(doc, fileName, options = {}) {
  const blob = doc.output("blob");
  await presentFileBlob(blob, fileName, {
    mimeType: "application/pdf",
    browserAction: options.browserAction === "open" ? "open" : "download",
    shareTitle: fileName,
    shareText: "Avaa tai jaa PDF-tiedosto",
    dialogTitle: "PDF-tiedosto",
    nativeFileName: options.nativeFileName,
    dedupeKey: options.dedupeKey,
    skipDuplicateGuard: options.skipDuplicateGuard,
  });
}

async function fetchImageDataUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Kuvan haku epäonnistui (HTTP ${response.status}).`);
  }
  const blob = await response.blob();
  return blobToDataUrl(blob);
}

function loadImageDimensions(dataUrl) {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !dataUrl) {
      resolve({ width: 1, height: 1 });
      return;
    }
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
    img.onerror = () => resolve({ width: 1, height: 1 });
    img.src = dataUrl;
  });
}

function loadImageElement(dataUrl) {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !dataUrl) {
      reject(new Error("Kuvaa ei voitu ladata."));
      return;
    }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Kuvaa ei voitu ladata."));
    img.src = dataUrl;
  });
}

function wrapCanvasText(ctx, text, maxWidth, maxLines = 2) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines = [];
  let currentLine = words[0];

  for (let index = 1; index < words.length; index += 1) {
    const nextLine = `${currentLine} ${words[index]}`;
    if (ctx.measureText(nextLine).width <= maxWidth) {
      currentLine = nextLine;
      continue;
    }
    lines.push(currentLine);
    currentLine = words[index];
    if (lines.length >= maxLines - 1) break;
  }

  if (lines.length < maxLines) {
    const remainingWords = words.slice(lines.join(" ").split(/\s+/).filter(Boolean).length);
    const lastLine = remainingWords.length > 0 ? [currentLine, ...remainingWords.slice(1)].join(" ") : currentLine;
    lines.push(lastLine);
  }

  if (lines.length > maxLines) return lines.slice(0, maxLines);
  return lines;
}

function fitCanvasFont(ctx, text, maxWidth, startSize, minSize = 18, fontWeight = "600", fontFamily = "Arial") {
  let size = startSize;
  while (size > minSize) {
    ctx.font = `${fontWeight} ${size}px ${fontFamily}`;
    if (ctx.measureText(String(text || "")).width <= maxWidth) break;
    size -= 1;
  }
  ctx.font = `${fontWeight} ${size}px ${fontFamily}`;
  return size;
}

async function renderMunbynLabelCanvas(label, qrDataUrl, logoDataUrl, printFormat = CATCH_LABEL_FORMAT_MUNBYN_4X6) {
  if (typeof document === "undefined") {
    throw new Error("Etiketin kuvarenderöinti ei ole käytettävissä.");
  }

  const thermalSize = getThermalLabelSizeMm(printFormat);
  const printableLabel = {
    ...label,
    qrImageUrl: qrDataUrl,
    logoUrl: logoDataUrl || label.logoUrl || getAppLogoUrl(),
  };
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.width = `${thermalSize.width}mm`;
  host.style.height = `${thermalSize.height}mm`;
  host.style.margin = "0";
  host.style.padding = "0";
  host.style.overflow = "hidden";
  host.style.background = "#ffffff";
  host.innerHTML = renderToStaticMarkup(renderThermalLabelByFormat(printFormat, printableLabel));
  document.body.appendChild(host);

  try {
    const images = Array.from(host.querySelectorAll("img"));
    await Promise.all(images.map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise((resolve) => {
        image.onload = resolve;
        image.onerror = resolve;
      });
    }));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const canvas = await html2canvas(host.firstElementChild || host, {
      backgroundColor: "#ffffff",
      scale: 3,
      useCORS: true,
      logging: false,
      width: host.firstElementChild?.offsetWidth || host.offsetWidth,
      height: host.firstElementChild?.offsetHeight || host.offsetHeight,
      windowWidth: host.firstElementChild?.scrollWidth || host.scrollWidth,
      windowHeight: host.firstElementChild?.scrollHeight || host.scrollHeight,
    });
    return canvas.toDataURL("image/png");
  } finally {
    host.remove();
  }
}

async function renderProcessedLabelCanvas(label, printFormat) {
  if (typeof document === "undefined") {
    throw new Error("Jaloste-etiketin kuvarenderointi ei ole kaytettavissa.");
  }

  const labelSize = getProcessedLabelSizeMm(printFormat);
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.width = `${labelSize.width}mm`;
  host.style.height = `${labelSize.height}mm`;
  host.style.margin = "0";
  host.style.padding = "0";
  host.style.overflow = "hidden";
  host.style.background = "#ffffff";
  host.innerHTML = renderToStaticMarkup(renderProcessedLabelByFormat(printFormat, label));
  document.body.appendChild(host);

  try {
    const images = Array.from(host.querySelectorAll("img"));
    await Promise.all(images.map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise((resolve) => {
        image.onload = resolve;
        image.onerror = resolve;
      });
    }));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const canvas = await html2canvas(host.firstElementChild || host, {
      backgroundColor: "#ffffff",
      scale: 3,
      useCORS: true,
      logging: false,
      width: host.firstElementChild?.offsetWidth || host.offsetWidth,
      height: host.firstElementChild?.offsetHeight || host.offsetHeight,
      windowWidth: host.firstElementChild?.scrollWidth || host.scrollWidth,
      windowHeight: host.firstElementChild?.scrollHeight || host.scrollHeight,
    });
    return canvas.toDataURL("image/png");
  } finally {
    host.remove();
  }
}

function buildCatchLabelPdfFileName(entry) {
  return `kalaetiketit-${String(entry?.batchId || "era").replace(/[^a-zA-Z0-9-_]+/g, "_")}.pdf`;
}

function buildUniqueCatchLabelNativeFileName(entry) {
  const baseName = buildCatchLabelPdfFileName(entry).replace(/\.pdf$/i, "");
  return `${baseName}-${Date.now()}.pdf`;
}

function buildProcessedLabelPdfFileName(entry, printFormat) {
  const sizeLabel = printFormat === PROCESSED_LABEL_FORMAT_4X3 ? "4x3" : "4x6";
  return `jaloste-etiketti-${sizeLabel}-${String(entry?.batchId || entry?.productName || "era").replace(/[^a-zA-Z0-9-_]+/g, "_")}.pdf`;
}

function buildProcessedLabelPrintHtml(entry, profileLike, printFormat) {
  const label = buildProcessedLabelData(entry, profileLike);
  const labelSize = getProcessedLabelSizeMm(printFormat);

  return `
    <!doctype html>
    <html lang="fi">
      <head>
        <meta charset="utf-8" />
        <title>Jaloste-etiketti ${String(entry?.batchId || "")}</title>
        <style>
          @page { size: ${labelSize.width}mm ${labelSize.height}mm; margin: 0; }
          html, body { width: ${labelSize.width}mm; height: ${labelSize.height}mm; margin: 0; padding: 0; overflow: hidden; box-sizing: border-box; background: #fff; }
          * { box-sizing: border-box; }
        </style>
      </head>
      <body>${renderToStaticMarkup(renderProcessedLabelByFormat(printFormat, label))}</body>
    </html>
  `;
}

async function buildProcessedLabelPdf(entry, profileLike, printFormat) {
  const label = buildProcessedLabelData(entry, profileLike);
  const labelSize = getProcessedLabelSizeMm(printFormat);
  const labelImage = await renderProcessedLabelCanvas(label, printFormat);
  const doc = new jsPDF({
    orientation: labelSize.width > labelSize.height ? "landscape" : "portrait",
    unit: "mm",
    format: [labelSize.width, labelSize.height],
    compress: true,
  });
  doc.addImage(labelImage, "PNG", 0, 0, labelSize.width, labelSize.height, undefined, "FAST");
  return doc;
}

async function buildCatchLabelPdf(entry, profileLike, labelCount, printFormat = CATCH_LABEL_FORMAT_APLI_1278) {
  const count = Math.max(1, Number(labelCount || 1));
  const labels = Array.from({ length: count }, (_, index) => buildCatchLabelData(entry, profileLike, index + 1, count));
  const [qrDataUrls, logoDataUrl] = await Promise.all([
    Promise.all(labels.map((label) => fetchImageDataUrl(getCatchLabelQrImageUrl(label)))),
    fetchImageDataUrl(getAppLogoUrl()).catch(() => ""),
  ]);
  const logoDimensions = await loadImageDimensions(logoDataUrl);

  if (isThermalCatchLabelFormat(printFormat)) {
    const thermalSize = getThermalLabelSizeMm(printFormat);
    const doc = new jsPDF({
      orientation: thermalSize.width > thermalSize.height ? "landscape" : "portrait",
      unit: "mm",
      format: [thermalSize.width, thermalSize.height],
      compress: true,
    });

    for (let index = 0; index < labels.length; index += 1) {
      if (index > 0) {
        doc.addPage([thermalSize.width, thermalSize.height], thermalSize.width > thermalSize.height ? "landscape" : "portrait");
      }
      const labelImage = await renderMunbynLabelCanvas(labels[index], qrDataUrls[index], logoDataUrl, printFormat);
      doc.addImage(labelImage, "PNG", 0, 0, thermalSize.width, thermalSize.height, undefined, "FAST");
    }

    return doc;
  }

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const labelWidth = 105;
  const labelHeight = 57;
  const topMargin = 6;
  const rowGap = 0;
  const logoMaxWidth = 14.4;
  const logoMaxHeight = 12;
  const qrSize = 18;
  const labelPaddingX = 6.2;
  const labelPaddingY = 2.4;
  const qrRightInset = 5;
  const qrColumnWidth = 27;
  const contentWidth = labelWidth - (labelPaddingX * 2) - qrColumnWidth - 2.4;

  const drawLabel = (label, qrDataUrl, x, y) => {
    const left = x + labelPaddingX;
    const top = y + labelPaddingY;
    const qrX = x + labelWidth - labelPaddingX - qrSize - qrRightInset;
    const qrY = y + labelHeight - labelPaddingY - qrSize;
    const logoAspectRatio = Number(logoDimensions.width || 1) / Number(logoDimensions.height || 1);
    const logoWidth = logoAspectRatio >= 1
      ? logoMaxWidth
      : Math.min(logoMaxWidth, logoMaxHeight * logoAspectRatio);
    const logoHeight = logoAspectRatio >= 1
      ? Math.min(logoMaxHeight, logoMaxWidth / logoAspectRatio)
      : logoMaxHeight;
    const brandX = qrX + ((qrSize - logoWidth) / 2);
    const brandY = top + 0.2;
    const textWidth = qrX - left - 2.4;
    let currentY = top + 4.2;

    if (logoDataUrl) {
      doc.addImage(logoDataUrl, "PNG", brandX, brandY, logoWidth, logoHeight);
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.2);
    doc.text("Suoraan", qrX + (qrSize / 2), brandY + logoHeight + 2.2, { align: "center" });
    doc.text("Kalastajalta", qrX + (qrSize / 2), brandY + logoHeight + 4.5, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13.5);
    const speciesLines = doc.splitTextToSize(label.species || "-", textWidth);
    doc.text(speciesLines, left, currentY);
    currentY += speciesLines.length * 4.8;

    if (label.scientificName) {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      doc.setFontSize(7);
      const scientificLines = doc.splitTextToSize(label.scientificName, textWidth);
      doc.text(scientificLines, left, currentY);
      currentY += scientificLines.length * 3;
      doc.setTextColor(17, 24, 39);
    }

    currentY += 0.5;
    doc.setFillColor(239, 246, 255);
    doc.setDrawColor(147, 197, 253);
    doc.roundedRect(left, currentY - 2.6, textWidth, 6.2, 1.1, 1.1, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.6);
    doc.text(`Erätunnus: ${label.batchId || "-"}`, left + 1.2, currentY + 1.6);
    currentY += 5.6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.4);
    const lines = [
      label.catchArea ? `Pyyntialue: ${label.catchArea}` : "",
      label.harvestSourceText || "",
      label.gearType ? `Pyyntimenetelmä: ${label.gearType}` : "",
      label.productStateText || "",
      label.catchDate ? `Pyyntipäivä: ${label.catchDate}` : "",
      label.commercialFishingId ? `Kaupallisen kalastajan tunnus: ${label.commercialFishingId}` : "",
      label.productForm ? `Tuote: ${label.productForm}` : "",
    ].filter(Boolean);

    lines.forEach((line) => {
      const isCatchDateLine = line.startsWith("Pyyntipäivä:");
      doc.setFont("helvetica", isCatchDateLine ? "bold" : "normal");
      doc.setFontSize(isCatchDateLine ? 7.6 : 6.4);
      const wrapped = doc.splitTextToSize(line, textWidth);
      doc.text(wrapped, left, currentY);
      currentY += wrapped.length * (isCatchDateLine ? 3.2 : 2.8);
    });

    currentY += 0.8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.2);
    doc.text("Säilytys: 0–2 °C", left, currentY);
    currentY += 3.6;

    const supplierLines = [
      `Toimittaja: ${label.supplier || "-"}`,
      label.supplierAddress || "",
      label.supplierContact || "",
    ].filter(Boolean);
    const wrappedSupplierLines = supplierLines.flatMap((line) => doc.splitTextToSize(line, textWidth));
    const supplierLineHeight = 2.6;
    const supplierBlockHeight = wrappedSupplierLines.length * supplierLineHeight;
    const supplierStartY = Math.max(currentY + 3.4, qrY + qrSize - supplierBlockHeight);
    const weightY = supplierStartY - 2.8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.text("Paino:", left, weightY);
    doc.setLineWidth(0.45);
    doc.line(left + 12.2, weightY + 0.15, qrX - 4.2, weightY + 0.15);
    doc.text("kg", qrX - 3.6, weightY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.4);
    wrappedSupplierLines.forEach((line, index) => {
      doc.text(line, left, supplierStartY + (index * supplierLineHeight));
    });

    doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);
  };

  labels.forEach((label, index) => {
    if (index > 0 && index % 10 === 0) {
      doc.addPage("a4", "portrait");
    }
    const pageIndex = index % 10;
    const row = Math.floor(pageIndex / 2);
    const col = pageIndex % 2;
    const x = col * labelWidth;
    const y = topMargin + row * (labelHeight + rowGap);
    drawLabel(label, qrDataUrls[index], x, y);
  });

  return doc;
}

function getRequestedPublicBatchId() {
  if (typeof window === "undefined") return "";
  const pathname = String(window.location.pathname || "");
  if (pathname.startsWith("/batch/")) {
    return decodeURIComponent(pathname.slice("/batch/".length)).trim();
  }
  const params = new URLSearchParams(window.location.search);
  if (!params.get("offer") && params.get("batch")) {
    return String(params.get("batch") || "").trim();
  }
  return "";
}

function getRequestedOfferId() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return String(params.get("offer") || "").trim();
}

function getCatchFormDefaultsStorageKey(profileLike) {
  const profileKey = String(profileLike?.id || profileLike?.email || "").trim().toLowerCase();
  return profileKey ? `${CATCH_FORM_DEFAULTS_KEY}:${profileKey}` : CATCH_FORM_DEFAULTS_KEY;
}

function parseStoredCatchFormDefaults(raw) {
  const parsed = raw ? JSON.parse(raw) : {};
  const parsedGearProfiles = parsed?.gearProfiles && typeof parsed.gearProfiles === "object" ? parsed.gearProfiles : {};
  const gearProfiles = Object.fromEntries(
    Object.entries(parsedGearProfiles).map(([gearName, profile]) => [
      String(gearName || "").trim(),
      {
        gearCount: String(profile?.gearCount || ""),
        gearCountOptions: Array.isArray(profile?.gearCountOptions) ? profile.gearCountOptions.map((item) => String(item || "").trim()).filter(Boolean) : [],
        fishingDurationDays: String(profile?.fishingDurationDays || ""),
        fishingDurationOptions: Array.isArray(profile?.fishingDurationOptions) ? profile.fishingDurationOptions.map((item) => String(item || "").trim()).filter(Boolean) : [],
        netHeight: String(profile?.netHeight || ""),
        netHeightOptions: Array.isArray(profile?.netHeightOptions) ? profile.netHeightOptions.map((item) => String(item || "").trim()).filter(Boolean) : [],
        netMeshSize: String(profile?.netMeshSize || ""),
        netMeshSizeOptions: Array.isArray(profile?.netMeshSizeOptions) ? profile.netMeshSizeOptions.map((item) => String(item || "").trim()).filter(Boolean) : [],
        fykeHeight: String(profile?.fykeHeight || ""),
        fykeHeightOptions: Array.isArray(profile?.fykeHeightOptions) ? profile.fykeHeightOptions.map((item) => String(item || "").trim()).filter(Boolean) : [],
      },
    ]),
  );
  return {
    area: String(parsed?.area || "Saimaa"),
    waterType: String(parsed?.waterType || ""),
    customLakeAreas: Array.isArray(parsed?.customLakeAreas) ? parsed.customLakeAreas.map((item) => String(item || "").trim()).filter(Boolean) : [],
    customSeaAreas: Array.isArray(parsed?.customSeaAreas) ? parsed.customSeaAreas.map((item) => String(item || "").trim()).filter(Boolean) : [],
    municipality: String(parsed?.municipality || ""),
    landingPlace: String(parsed?.landingPlace || ""),
    landingPlaces: sanitizeLandingPlaceHistory(Array.isArray(parsed?.landingPlaces) ? parsed.landingPlaces : []),
    deliveryDestinations: normalizeDestinationCities(parsed?.deliveryDestinations),
    deliveryArea: String(parsed?.deliveryArea || ""),
    gear: String(parsed?.gear || "Rysä"),
    gearCount: String(parsed?.gearCount || ""),
    gearCountOptions: Array.isArray(parsed?.gearCountOptions) ? parsed.gearCountOptions.map((item) => String(item || "").trim()).filter(Boolean) : [],
    fishingDurationDays: String(parsed?.fishingDurationDays || ""),
    fishingDurationOptions: Array.isArray(parsed?.fishingDurationOptions) ? parsed.fishingDurationOptions.map((item) => String(item || "").trim()).filter(Boolean) : [],
    netHeight: String(parsed?.netHeight || ""),
    netHeightOptions: Array.isArray(parsed?.netHeightOptions) ? parsed.netHeightOptions.map((item) => String(item || "").trim()).filter(Boolean) : [],
    netMeshSize: String(parsed?.netMeshSize || ""),
    netMeshSizeOptions: Array.isArray(parsed?.netMeshSizeOptions) ? parsed.netMeshSizeOptions.map((item) => String(item || "").trim()).filter(Boolean) : [],
    fykeHeight: String(parsed?.fykeHeight || ""),
    fykeHeightOptions: Array.isArray(parsed?.fykeHeightOptions) ? parsed.fykeHeightOptions.map((item) => String(item || "").trim()).filter(Boolean) : [],
    gearProfiles,
  };
}

function getStoredGearProfile(defaults, gearName) {
  const normalizedGearName = String(gearName || "").trim();
  if (!normalizedGearName) {
    return {
      gearCount: "",
      gearCountOptions: [],
      fishingDurationDays: "",
      fishingDurationOptions: [],
      netHeight: "",
      netHeightOptions: [],
      netMeshSize: "",
      netMeshSizeOptions: [],
      fykeHeight: "",
      fykeHeightOptions: [],
    };
  }

  const storedProfile = defaults?.gearProfiles?.[normalizedGearName];
  if (storedProfile) {
    return {
      gearCount: String(storedProfile.gearCount || ""),
      gearCountOptions: Array.isArray(storedProfile.gearCountOptions) ? storedProfile.gearCountOptions : [],
      fishingDurationDays: String(storedProfile.fishingDurationDays || ""),
      fishingDurationOptions: Array.isArray(storedProfile.fishingDurationOptions) ? storedProfile.fishingDurationOptions : [],
      netHeight: String(storedProfile.netHeight || ""),
      netHeightOptions: Array.isArray(storedProfile.netHeightOptions) ? storedProfile.netHeightOptions : [],
      netMeshSize: String(storedProfile.netMeshSize || ""),
      netMeshSizeOptions: Array.isArray(storedProfile.netMeshSizeOptions) ? storedProfile.netMeshSizeOptions : [],
      fykeHeight: String(storedProfile.fykeHeight || ""),
      fykeHeightOptions: Array.isArray(storedProfile.fykeHeightOptions) ? storedProfile.fykeHeightOptions : [],
    };
  }

  return {
    gearCount: String(defaults?.gearCount || ""),
    gearCountOptions: Array.isArray(defaults?.gearCountOptions) ? defaults.gearCountOptions : [],
    fishingDurationDays: String(defaults?.fishingDurationDays || ""),
    fishingDurationOptions: Array.isArray(defaults?.fishingDurationOptions) ? defaults.fishingDurationOptions : [],
    netHeight: String(defaults?.netHeight || ""),
    netHeightOptions: Array.isArray(defaults?.netHeightOptions) ? defaults.netHeightOptions : [],
    netMeshSize: String(defaults?.netMeshSize || ""),
    netMeshSizeOptions: Array.isArray(defaults?.netMeshSizeOptions) ? defaults.netMeshSizeOptions : [],
    fykeHeight: String(defaults?.fykeHeight || ""),
    fykeHeightOptions: Array.isArray(defaults?.fykeHeightOptions) ? defaults.fykeHeightOptions : [],
  };
}

function getStoredCatchFormDefaults(profileLike = null) {
  if (typeof window === "undefined") {
    return {
      area: "Saimaa",
      waterType: "",
      customLakeAreas: [],
      customSeaAreas: [],
      municipality: "",
      landingPlace: "",
      landingPlaces: [],
      deliveryDestinations: [],
      deliveryArea: "",
      gear: "Rysä",
      gearCount: "",
      fishingDurationDays: "",
      netHeight: "",
      netMeshSize: "",
      fykeHeight: "",
    };
  }
  try {
    const storageKey = getCatchFormDefaultsStorageKey(profileLike);
    const raw = window.localStorage.getItem(storageKey);
    return parseStoredCatchFormDefaults(raw);
  } catch {
    return {
      area: "Saimaa",
      waterType: "",
      customLakeAreas: [],
      customSeaAreas: [],
      municipality: "",
      landingPlace: "",
      landingPlaces: [],
      deliveryDestinations: [],
      deliveryArea: "",
      gear: "Rysä",
      gearCount: "",
      gearCountOptions: [],
      fishingDurationDays: "",
      fishingDurationOptions: [],
      netHeight: "",
      netHeightOptions: [],
      netMeshSize: "",
      netMeshSizeOptions: [],
      fykeHeight: "",
      fykeHeightOptions: [],
    };
  }
}

function getOnboardingGuideStorageKey(profileLike) {
  const profileId = String(profileLike?.id || profileLike?.email || "anonymous").trim().toLowerCase() || "anonymous";
  const role = String(profileLike?.role || "unknown").trim().toLowerCase() || "unknown";
  return `${ONBOARDING_GUIDE_STORAGE_PREFIX}:${profileId}:${role}`;
}

function getStoredOnboardingGuideState(profileLike) {
  if (typeof window === "undefined") return { views: 0, hiddenForever: false };
  try {
    const raw = window.localStorage.getItem(getOnboardingGuideStorageKey(profileLike));
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      views: Number(parsed?.views || 0),
      hiddenForever: Boolean(parsed?.hiddenForever),
    };
  } catch {
    return { views: 0, hiddenForever: false };
  }
}

function saveStoredOnboardingGuideState(profileLike, state) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      getOnboardingGuideStorageKey(profileLike),
      JSON.stringify({
        views: Number(state?.views || 0),
        hiddenForever: Boolean(state?.hiddenForever),
      }),
    );
  } catch {
    // ignore local storage issues
  }
}

function getRoleOnboardingGuideContent(role) {
  if (role === "buyer") {
    return {
      title: "Aloita ostajana näin",
      intro: "Nämä ohjeet näkyvät vain ensimmäisillä käyttökerroilla tai kunnes piilotat ne kokonaan.",
      steps: [
        "Täytä ensin Omat tiedot: yritys, toimitusosoite, laskutustiedot, sähköposti ja puhelin.",
        "Avaa sinulle tarjotut kalaerät, tee varaus tai lähetä vastatarjous.",
        "Kun kalastaja hyväksyy kaupan, näet hänen täydet yhteystietonsa ja voit sopia toimituksen loppuun.",
        "Kun erä on saapunut, merkitse toimitus toimitetuksi, jotta laskutus voi edetä oikein.",
      ],
    };
  }

  if (role === "processor") {
    return {
      title: "Aloita jalostajana näin",
      intro: "Nämä ohjeet auttavat alkuun ensimmäisillä käyttökerroilla ja ne voi piilottaa milloin tahansa.",
      steps: [
        "Täytä ensin Omat tiedot: yrityksen yhteystiedot, laskutustiedot ja Laitosnumero.",
        "Kun olet ostanut YKP-raaka-aine-eriä, voit liittää ne jaloste-erälle kohdassa Lisää jaloste-erä.",
        "Lisää jaloste-erän tuotetiedot, jäljitettävyys ja toimitustiedot, ja lähetä tarjous ostajille tarvittaessa.",
        "Seuraa ostajien vastauksia Tarjoukset-välilehdellä.",
      ],
    };
  }

  if (role === "owner") {
    return {
      title: "Aloita ylläpitäjänä näin",
      intro: "Tämä pikamuistilista näkyy vain alussa ja sen voi sulkea pysyvästi.",
      steps: [
        "Hyväksy erikoisroolit ja hallitse kalastajalisenssejä Käyttäjät-välilehdellä.",
        "Päivitä ostajarekisteri Ostajat-välilehdellä, jotta tarjoukset ohjautuvat oikeille yrityksille.",
        "Tarkista Raportit ja Laskutus säännöllisesti, jos haluat seurata kaupankäyntiä ja komissioita.",
      ],
    };
  }

  return {
    title: "Aloita kalastajana näin",
    intro: "Nämä ohjeet näkyvät vain ensimmäisillä käyttökerroilla tai kunnes valitset Älä näytä enää.",
    steps: [
      "Täytä ensin Omat tiedot: yrityksen tiedot, kaupallisen kalastajan tunnus ja käytössä olevat kaupallisen kalastusaluksen tunnukset.",
      "Siirry Lisää saalis -välilehdelle, täytä saalistiedot ja tallenna erä saaliskirjanpitoon.",
      "Kalastajalisenssi avaa myyntiin tarjoamisen, jäljitettävyystunnuksen, etikettien tulostuksen ja virallisen saalisilmoituksen.",
      "Kun ostaja on merkinnyt toimituksen vastaanotetuksi, muodosta lasku Laskutus-välilehdellä.",
    ],
  };
}

function resolveAreaSelectorValue(area, customLakeAreas = [], customSeaAreas = []) {
  const normalized = String(area || "").trim();
  if (!normalized) return "Saimaa";
  if (defaultAreas.includes(normalized)) return normalized;
  if (customSeaAreas.includes(normalized)) return CUSTOM_SEA_AREA_OPTION;
  if (customLakeAreas.includes(normalized)) return CUSTOM_LAKE_AREA_OPTION;
  return CUSTOM_LAKE_AREA_OPTION;
}

function buildAreaHistory(currentValue, previousValues = []) {
  return Array.from(new Set([
    String(currentValue || "").trim(),
    ...previousValues.map((item) => String(item || "").trim()),
  ].filter(Boolean))).slice(0, 20);
}

function sanitizeLandingPlaceHistory(values = []) {
  const uniqueValues = Array.from(new Set(
    values
      .map((item) => String(item || "").trim())
      .filter(Boolean)
  ));

  return uniqueValues.filter((value) => {
    const normalizedValue = value.toLowerCase();
    return !uniqueValues.some((candidate) => {
      const normalizedCandidate = String(candidate || "").trim().toLowerCase();
      return normalizedCandidate.length > normalizedValue.length && normalizedCandidate.startsWith(normalizedValue);
    });
  }).slice(0, 20);
}

function buildLandingPlaceHistory(currentLandingPlace, previousLandingPlaces = []) {
  return sanitizeLandingPlaceHistory([
    String(currentLandingPlace || "").trim(),
    ...previousLandingPlaces.map((item) => String(item || "").trim()),
  ]);
}

function buildRememberedOptions(currentValue, previousValues = [], limit = 20) {
  const values = [
    String(currentValue || "").trim(),
    ...previousValues.map((item) => String(item || "").trim()),
  ].filter(Boolean);
  return Array.from(new Set(values)).slice(0, limit);
}

function fulfillmentStatusLabel(status) {
  if (status === "awaiting_contact") return "Yhteydenotto kesken";
  if (status === "delivery_agreed") return "Toimitus sovittu";
  if (status === "delivered") return "Toimitettu";
  return "Yhteydenotto kesken";
}

function getNotificationRouteTarget(data) {
  const route = String(data?.route || "");
  if (route === "billing") return "billing";
  if (route === "offers") return "offers";
  return "dashboard";
}

function formatBatchArea(area) {
  return String(area || "BATCH")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase() || "BATCH";
}

function formatBatchSourceIdentifier(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toUpperCase();
}

function parseCommercialFishingVesselIds(value) {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean)));
  }

  return Array.from(
    new Set(
      String(value || "")
        .split(/[\n,;]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function getCommercialFishingVesselIds(profileLike) {
  const multiple = parseCommercialFishingVesselIds(profileLike?.commercial_fishing_vessel_ids);
  if (multiple.length > 0) return multiple;
  return parseCommercialFishingVesselIds(profileLike?.commercial_fishing_vessel_id);
}

function getPreferredBatchSourceIdentifier(profileLike, selectedVesselId = "") {
  return String(
    selectedVesselId ||
    getCommercialFishingVesselIds(profileLike)[0] ||
    profileLike?.commercial_fishing_vessel_id ||
    profileLike?.commercial_fishing_id ||
    ""
  ).trim();
}

function getProcessedBatchSourceIdentifier(profileLike) {
  return String(
    profileLike?.evira_facility_id ||
    profileLike?.approval_number ||
    profileLike?.establishment_number ||
    ""
  ).trim();
}

function formatBatchDate(dateValue) {
  const normalized = String(dateValue || today()).slice(0, 10);
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return normalized.replace(/[^0-9]/g, "").slice(-6);
  return `${match[1].slice(2)}${match[2]}${match[3]}`;
}

function normalizeFishSpeciesLabel(value) {
  return String(value || "")
    .split(",")[0]
    .replace(/\b(filee|filet|avattu|perattu|päätön|nyljetty)\b/gi, "")
    .replace(/\b\d+\+\s*cm\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getSpeciesFaoCode(speciesLabels) {
  const labels = Array.isArray(speciesLabels) ? speciesLabels : [speciesLabels];
  const normalizedLabels = labels
    .map((label) => normalizeFishSpeciesLabel(label))
    .filter(Boolean);

  const uniqueLabels = Array.from(new Set(normalizedLabels));
  if (uniqueLabels.length === 0) return "MIX";
  if (uniqueLabels.length > 1) return "MIX";

  const directMatch = fishSpeciesByName[uniqueLabels[0]]?.fao;
  if (directMatch) return directMatch;

  return uniqueLabels[0]
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "")
    .slice(0, 3)
    .toUpperCase() || "MIX";
}

function formatBatchQuantity(value) {
  const quantity = Number(value || 0);
  if (!Number.isFinite(quantity) || quantity <= 0) return "0";
  if (Number.isInteger(quantity)) return String(quantity);
  return quantity.toFixed(3).replace(/\.?0+$/, "").replace(/[^0-9]/g, "");
}

function getBatchSequenceNumber(batchId) {
  const match = String(batchId || "").match(/-(\d+)$/);
  if (!match) return 0;
  return Number(match[1] || 0);
}

function generateDraftCatchBatchId({ date, ownerUserId, rowIndex = 0 }) {
  const batchDate = formatBatchDate(date) || new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const ownerPart = String(ownerUserId || "LOCAL")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase()
    .slice(-6) || "LOCAL";
  const randomPart = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID().replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 8)
    : `${Date.now()}${Math.random()}`.replace(/[^0-9]/g, "").slice(-8);
  return `FREE-${batchDate}-${ownerPart}${rowIndex + 1}-${randomPart}`;
}

async function generateBatchId({ sourceIdentifier, date, speciesLabels, quantity, supabaseClient, ownerUserId, insertSeparatorAfterSource = false }) {
  const batchSourceIdentifier = formatBatchSourceIdentifier(sourceIdentifier);
  if (!batchSourceIdentifier) {
    throw new Error("Aseta kaupallisen kalastusaluksen tunnus tai kaupallisen kalastajan tunnus kohdassa Omat tiedot ennen eräkoodin luontia.");
  }

  const batchDate = formatBatchDate(date);
  const speciesCode = getSpeciesFaoCode(speciesLabels);
  const quantityCode = formatBatchQuantity(quantity);
  const prefix = `${batchSourceIdentifier}${insertSeparatorAfterSource ? "-" : ""}${batchDate}${speciesCode}${quantityCode}`;

  if (!ownerUserId) {
    throw new Error("Käyttäjän tunniste puuttuu eräkoodin luontia varten.");
  }

  const [catchResult, processedResult] = await Promise.all([
    supabaseClient
      .from("catch_entries")
      .select("batch_id")
      .eq("owner_user_id", ownerUserId),
    supabaseClient
      .from("processed_batches")
      .select("batch_id")
      .eq("owner_user_id", ownerUserId),
  ]);

  if (catchResult.error) throw catchResult.error;
  if (processedResult.error && processedResult.error.code !== "PGRST116") throw processedResult.error;

  const highestSequence = [...(catchResult.data || []), ...(processedResult.data || [])].reduce((maxValue, row) => {
    return Math.max(maxValue, getBatchSequenceNumber(row?.batch_id));
  }, 0);

  const sequence = String(highestSequence + 1);
  return `${prefix}-${sequence}`;
}

function euro(value) {
  return new Intl.NumberFormat("fi-FI", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function parseLocaleNumber(value) {
  if (value === "" || value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value)
    .trim()
    .replace(/\s+/g, "")
    .replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCatchGearValue(value) {
  const gear = String(value || "").trim();
  if (!gear) return "";
  if (gear === "Trooli") return "Trooli";
  if (gear.startsWith("Nuotta")) return "Nuotta";
  if (gear === "Muikkuverkko" || gear.startsWith("Verkko") || gear === "Verkko") return "Verkko";
  if (gear.startsWith("Rysä / paunetti") || gear === "Rysä" || gear === "Paunetti/avorysä") return "Rysä";
  if (gear === "Katiska") return "Katiska";
  if (gear === "Merta") return "Merta";
  if (gear === "Vapapyydys tai vetouistin" || gear === "Vapaväline") return "Vapaväline";
  if (gear === "Muu pyydys" || gear === "Muu") return "Muu";
  return gear;
}

function getFishingDurationFieldMeta(gearValue) {
  const normalizedGear = normalizeCatchGearValue(gearValue);
  const gear = String(gearValue || "").trim();

  if (gear === "Trooli" || gear === "Hoitokalastus troolilla") {
    return {
      label: "Pyyntiaika ja vetonopeus",
      durationLabel: "Troolausaika (t:mm)",
      speedLabel: "Vetonopeus (km/h)",
      durationPlaceholder: "Esim. 4:20",
      speedPlaceholder: "Esim. 4",
      help: "Troolille ilmoitetaan yhteenlaskettu troolausaika tunteina ja vetonopeus km/h.",
      splitFields: true,
    };
  }

  if (
    gear === "Nuotta, korkeus yli 10 m" ||
    gear === "Nuotta, korkeus alle 10 m" ||
    gear === "Hoitokalastus nuotalla" ||
    normalizedGear === "Nuotta"
  ) {
    return {
      label: "Pyyntiaika ja vetonopeus",
      durationLabel: "Nuottausaika (t:mm)",
      speedLabel: "Vetonopeus (m/min)",
      durationPlaceholder: "Esim. 6:30",
      speedPlaceholder: "Esim. 240",
      help: "Nuotalle ilmoitetaan yhteenlaskettu nuottausaika tunteina ja vetonopeus metreinä minuutissa.",
      splitFields: true,
    };
  }

  return {
    label: "Pyyntivuorokaudet",
    placeholder: "Esim. 6 pv",
    help: "Verkoille, rysille, katiskoille ja muille seisoville pyydyksille ilmoitetaan pyyntivuorokausien lukumäärä.",
    splitFields: false,
  };
}

function parseFishingDurationValue(gearValue, value) {
  const meta = getFishingDurationFieldMeta(gearValue);
  const rawValue = String(value || "").trim();

  if (!meta.splitFields) {
    return { duration: rawValue, speed: "" };
  }

  const [duration = "", speed = ""] = rawValue.split("/");
  return {
    duration: String(duration || "").trim(),
    speed: String(speed || "").trim(),
  };
}

function buildFishingDurationValue(gearValue, duration, speed) {
  const meta = getFishingDurationFieldMeta(gearValue);
  const normalizedDuration = String(duration || "").trim();
  const normalizedSpeed = String(speed || "").trim();

  if (!meta.splitFields) {
    return normalizedDuration;
  }

  if (normalizedDuration && normalizedSpeed) return `${normalizedDuration}/${normalizedSpeed}`;
  if (normalizedDuration) return normalizedDuration;
  if (normalizedSpeed) return `/${normalizedSpeed}`;
  return "";
}

function validateCatchFormForOfficialReporting(form) {
  const issues = [];
  const gear = String(form?.gear || "").trim();
  const normalizedGear = normalizeCatchGearValue(gear);
  const fishingMeta = getFishingDurationFieldMeta(gear);
  const fishingParts = parseFishingDurationValue(gear, form?.fishingDurationDays);

  if (!String(form?.area || "").trim()) {
    issues.push("Kalastamisalue puuttuu.");
  }
  if (!String(form?.municipality || "").trim()) {
    issues.push("Paikkakunta puuttuu.");
  }
  if (!String(form?.landingPlace || "").trim()) {
    issues.push("Purkamispaikka puuttuu.");
  }
  if (!gear) {
    issues.push("Pyydys puuttuu.");
  }
  if (!String(form?.gearCount || "").trim()) {
    issues.push("Pyydysten määrä puuttuu.");
  }

  if (fishingMeta.splitFields) {
    if (!fishingParts.duration) {
      issues.push(`${fishingMeta.durationLabel} puuttuu.`);
    }
    if (!fishingParts.speed) {
      issues.push(`${fishingMeta.speedLabel} puuttuu.`);
    }
  } else if (!String(form?.fishingDurationDays || "").trim()) {
    issues.push("Pyyntivuorokaudet puuttuvat.");
  }

  if (normalizedGear === "Verkko" && !String(form?.netMeshSize || "").trim()) {
    issues.push("Verkon solmuväli puuttuu.");
  }

  if (
    normalizedGear === "Rysä" &&
    gear !== "Rysä / paunetti, korkeus yli 1,5 m" &&
    gear !== "Rysä / paunetti, korkeus alle 1,5 m" &&
    !String(form?.fykeHeight || "").trim()
  ) {
    issues.push("Rysän tai paunetin korkeus puuttuu.");
  }

  return issues;
}

function validateOfficialCatchEntries(entries = []) {
  const issues = [];

  entries.forEach((entry) => {
    const gear = String(entry?.gear || "").trim();
    const normalizedGear = normalizeCatchGearValue(gear);
    const fishingMeta = getFishingDurationFieldMeta(gear);
    const fishingParts = parseFishingDurationValue(gear, entry?.fishingDurationDays);
    const gearInfo = getOfficialGearCodeInfo(entry);
    const identifier = String(entry?.batchId || entry?.batch_id || entry?.id || "").trim() || "tuntematon erä";

    const missing = [];
    if (!String(entry?.date || "").trim()) missing.push("kalastuspäivä");
    if (!String(entry?.area || "").trim()) missing.push("kalastamisalue");
    if (!String(entry?.municipality || "").trim()) missing.push("paikkakunta");
    if (!String(entry?.landingPlace || "").trim()) missing.push("purkamispaikka");
    if (!gear) missing.push("pyydys");
    if (!String(entry?.gearCount || "").trim()) missing.push("pyydysten määrä");

    if (fishingMeta.splitFields) {
      if (!fishingParts.duration) missing.push(fishingMeta.durationLabel.toLowerCase());
      if (!fishingParts.speed) missing.push(fishingMeta.speedLabel.toLowerCase());
    } else if (!String(entry?.fishingDurationDays || "").trim()) {
      missing.push("pyyntivuorokaudet");
    }

    if (normalizedGear === "Verkko" && !String(entry?.netMeshSize || entry?.gear_mesh_size || "").trim()) {
      missing.push("verkon solmuväli");
    }

    if (
      normalizedGear === "Rysä" &&
      gear !== "Rysä / paunetti, korkeus yli 1,5 m" &&
      gear !== "Rysä / paunetti, korkeus alle 1,5 m" &&
      !String(entry?.fykeHeight || entry?.gear_fyke_height || "").trim()
    ) {
      missing.push("rysän tai paunetin korkeus");
    }

    if (!gearInfo.code) {
      missing.push("virallinen pyydyskoodi");
    }

    if (missing.length > 0) {
      issues.push(`${identifier}: ${missing.join(", ")}`);
    }
  });

  return issues;
}

function getCatchGearDetailLines(source) {
  const gear = normalizeCatchGearValue(source?.gear);
  const lines = [];

  if (gear === "Verkko") {
    const netHeight = String(source?.netHeight || source?.gear_net_height || "").trim();
    const netMeshSize = String(source?.netMeshSize || source?.gear_mesh_size || "").trim();
    if (netHeight) lines.push(`Verkon korkeus: ${netHeight}`);
    if (netMeshSize) lines.push(`Verkon solmuväli: ${netMeshSize}`);
  }

  if (gear === "Rysä") {
    const fykeHeight = String(source?.fykeHeight || source?.gear_fyke_height || "").trim();
    if (fykeHeight) lines.push(`Rysän korkeus: ${fykeHeight}`);
  }

  return lines;
}

function appendCatchGearDetailsToNotes(notes, source) {
  const detailLines = getCatchGearDetailLines(source);
  const baseNotes = String(notes || "").trim();
  if (detailLines.length === 0) return baseNotes;
  return [baseNotes, "Pyydyksen lisätiedot:", ...detailLines].filter(Boolean).join("\n");
}

function extractCatchGearDetailsFromNotes(notes) {
  const text = String(notes || "");
  return {
    netHeight: (text.match(/Verkon korkeus:\s*(.+)/i)?.[1] || "").trim(),
    netMeshSize: (text.match(/Verkon solmuväli:\s*(.+)/i)?.[1] || "").trim(),
    fykeHeight: (text.match(/Rysän korkeus:\s*(.+)/i)?.[1] || "").trim(),
  };
}

function formatCatchGearDisplay(source) {
  const gear = String(source?.gear || "").trim();
  if (!gear) return "-";
  const details = getCatchGearDetailLines({
    ...extractCatchGearDetailsFromNotes(source?.notes),
    ...source,
  });
  return details.length > 0 ? `${gear} · ${details.join(" · ")}` : gear;
}

function extractCatchLogisticsDetailsFromNotes(notes) {
  const text = String(notes || "");
  return {
    landingPlace: (text.match(/Purkamispaikka:\s*(.+)/i)?.[1] || "").trim(),
    gearCount: (text.match(/Pyydysten määrä:\s*(.+)/i)?.[1] || "").trim(),
    fishingDurationDays: (text.match(/Pyyntiaika:\s*(.+)/i)?.[1] || "").trim(),
  };
}

function appendCatchDetailsToNotes(notes, source) {
  const gearLines = getCatchGearDetailLines(source);
  const detailLines = [
    ...gearLines,
    String(source?.landingPlace || "").trim() ? `Purkamispaikka: ${String(source.landingPlace).trim()}` : "",
    String(source?.gearCount || "").trim() ? `Pyydysten määrä: ${String(source.gearCount).trim()}` : "",
    String(source?.fishingDurationDays || "").trim() ? `Pyyntiaika: ${String(source.fishingDurationDays).trim()}` : "",
  ].filter(Boolean);

  const baseNotes = String(notes || "").trim();
  if (detailLines.length === 0) return baseNotes;
  return [baseNotes, "Pyydyksen ja saaliin lisätiedot:", ...detailLines].filter(Boolean).join("\n");
}

function describeOfferEmailError(error) {
  if (!error) return "Tarjoussähköpostin lähetys epäonnistui";
  if (typeof error === "string") return error;
  if (typeof error?.message === "string" && error.message.trim()) return error.message;
  if (typeof error?.error === "string" && error.error.trim()) return error.error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function calculateCommissionDetails(offer, commissionRate = 0.03) {
  const lineItemTradeValue = parseSellerInvoiceLineItems(offer).reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
  const summaryTradeValue = parseTradeValueFromSpeciesSummary(offer?.species_summary);
  return calculateOfferCommissionValues({
    reservedKilos: offer?.reserved_kilos,
    totalKilos: offer?.total_kilos,
    counterPricePerKg: offer?.counter_price_per_kg,
    pricePerKg: offer?.price_per_kg,
    offerPricePerKg: offer?.offer_price_per_kg,
    lineItemTradeValue,
    summaryTradeValue,
    commissionRate,
  });
}

async function exportSpreadsheet(filename, rows, sheetName = "Raportti") {
  const workbookArray = buildSpreadsheetArray(rows, sheetName);
  const blob = new Blob([workbookArray], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  await presentFileBlob(blob, filename, {
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    browserAction: "download",
    shareTitle: filename,
    shareText: "Avaa tai jaa raportti",
    dialogTitle: "Raporttitiedosto",
  });
}

async function shareSpreadsheet(filename, rows, sheetName = "Raportti") {
  const workbookArray = buildSpreadsheetArray(rows, sheetName);
  const blob = new Blob([workbookArray], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  await presentFileBlob(blob, filename, {
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    browserAction: isNativeCapacitorApp() ? "open" : "download",
    shareTitle: filename,
    shareText: "Valitse sähköpostisovellus tai muu tapa jakaa raportti",
    dialogTitle: "Lähetä raportti",
  });
}

function buildSpreadsheetArray(rows, sheetName = "Raportti") {
  const workbook = XLSX.utils.book_new();
  const workbookSheets = Array.isArray(rows) && rows.every((item) => item && typeof item === "object" && Array.isArray(item.rows))
    ? rows
    : [{ name: sheetName, rows }];

  workbookSheets.forEach((sheet, index) => {
    const worksheet = XLSX.utils.aoa_to_sheet(Array.isArray(sheet.rows) ? sheet.rows : []);
    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      String(sheet.name || sheetName || `Raportti ${index + 1}`).slice(0, 31),
    );
  });
  return XLSX.write(workbook, { bookType: "xlsx", type: "array" });
}

const OFFICIAL_GEAR_CODE_NOTES = {
  1: "Trooli",
  2: "Nuotta, korkeus yli 10 m",
  3: "Nuotta, korkeus alle 10 m",
  4: "Muikkuverkko",
  5: "Muu verkko, solmuväli alle 25 mm",
  6: "Muu verkko, solmuväli 25 - 40 mm",
  7: "Muu verkko, solmuväli 41 - 54 mm",
  8: "Muu verkko, solmuväli yli 54 mm",
  9: "Rysä / paunetti, korkeus yli 1,5 m",
  10: "Rysä / paunetti, korkeus alle 1,5 m",
  11: "Katiska",
  12: "Merta",
  13: "Muu pyydys",
  14: "Hoitokalastus troolilla",
  15: "Hoitokalastus nuotalla",
  16: "Hoitokalastus rysällä, paunetilla, merralla ja katiskalla",
  17: "Hoitokalastus muulla pyydyksellä",
  18: "Vapapyydys tai vetouistin",
};

function parseMeasurementNumber(value) {
  const parsed = parseLocaleNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toWholeKilo(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed));
}

function getOfficialCatchAreaLabel(entry) {
  return [String(entry?.area || "").trim(), String(entry?.municipality || "").trim()]
    .filter(Boolean)
    .join(", ");
}

function getOfficialLandingPlaceLabel(entry) {
  return [String(entry?.landingPlace || "").trim(), String(entry?.municipality || "").trim()]
    .filter(Boolean)
    .join(", ");
}

function getOfficialGearCodeInfo(entry) {
  const gear = String(entry?.gear || "").trim();
  const normalizedGear = normalizeCatchGearValue(gear);
  if (!gear) {
    return {
      code: "",
      label: "-",
      note: "Pyydys puuttuu",
    };
  }

  if (gear === "Trooli") {
    return { code: "1", label: OFFICIAL_GEAR_CODE_NOTES[1], note: "" };
  }

  if (gear === "Nuotta, korkeus yli 10 m") {
    return { code: "2", label: OFFICIAL_GEAR_CODE_NOTES[2], note: "" };
  }

  if (gear === "Nuotta, korkeus alle 10 m") {
    return { code: "3", label: OFFICIAL_GEAR_CODE_NOTES[3], note: "" };
  }

  if (normalizedGear === "Nuotta") {
    return {
      code: "3",
      label: OFFICIAL_GEAR_CODE_NOTES[3],
      note: "Nuotalle käytetään oletuksena koodia 3, koska korkeustietoa ei tallenneta erikseen.",
    };
  }

  if (gear === "Muikkuverkko") {
    return { code: "4", label: OFFICIAL_GEAR_CODE_NOTES[4], note: "" };
  }

  if (gear === "Verkko, solmuväli alle 25 mm") {
    return { code: "5", label: OFFICIAL_GEAR_CODE_NOTES[5], note: "" };
  }

  if (gear === "Verkko, solmuväli 25 - 40 mm") {
    return { code: "6", label: OFFICIAL_GEAR_CODE_NOTES[6], note: "" };
  }

  if (gear === "Verkko, solmuväli 41 - 54 mm") {
    return { code: "7", label: OFFICIAL_GEAR_CODE_NOTES[7], note: "" };
  }

  if (gear === "Verkko, solmuväli yli 54 mm") {
    return { code: "8", label: OFFICIAL_GEAR_CODE_NOTES[8], note: "" };
  }

  if (normalizedGear === "Verkko") {
    const meshSize = parseMeasurementNumber(entry?.netMeshSize);
    if (meshSize == null) {
      return {
        code: "",
        label: gear,
        note: "Verkon solmuväli puuttuu, joten virallista verkkokoodia ei voitu päätellä.",
      };
    }
    if (meshSize < 25) return { code: "5", label: OFFICIAL_GEAR_CODE_NOTES[5], note: "" };
    if (meshSize <= 40) return { code: "6", label: OFFICIAL_GEAR_CODE_NOTES[6], note: "" };
    if (meshSize <= 54) return { code: "7", label: OFFICIAL_GEAR_CODE_NOTES[7], note: "" };
    return { code: "8", label: OFFICIAL_GEAR_CODE_NOTES[8], note: "" };
  }

  if (gear === "Rysä / paunetti, korkeus yli 1,5 m") {
    return { code: "9", label: OFFICIAL_GEAR_CODE_NOTES[9], note: "" };
  }

  if (gear === "Rysä / paunetti, korkeus alle 1,5 m") {
    return { code: "10", label: OFFICIAL_GEAR_CODE_NOTES[10], note: "" };
  }

  if (normalizedGear === "Rysä") {
    const height = parseMeasurementNumber(entry?.fykeHeight);
    if (height == null) {
      return {
        code: "",
        label: gear,
        note: "Rysän tai paunetin korkeus puuttuu, joten virallista koodia ei voitu päätellä.",
      };
    }
    if (height > 1.5) return { code: "9", label: OFFICIAL_GEAR_CODE_NOTES[9], note: "" };
    return { code: "10", label: OFFICIAL_GEAR_CODE_NOTES[10], note: "" };
  }

  if (gear === "Katiska") {
    return { code: "11", label: OFFICIAL_GEAR_CODE_NOTES[11], note: "" };
  }

  if (gear === "Merta") {
    return { code: "12", label: OFFICIAL_GEAR_CODE_NOTES[12], note: "" };
  }

  if (gear === "Hoitokalastus troolilla") {
    return { code: "14", label: OFFICIAL_GEAR_CODE_NOTES[14], note: "" };
  }

  if (gear === "Hoitokalastus nuotalla") {
    return { code: "15", label: OFFICIAL_GEAR_CODE_NOTES[15], note: "" };
  }

  if (gear === "Hoitokalastus rysällä, paunetilla, merralla ja katiskalla") {
    return { code: "16", label: OFFICIAL_GEAR_CODE_NOTES[16], note: "" };
  }

  if (gear === "Hoitokalastus muulla pyydyksellä") {
    return { code: "17", label: OFFICIAL_GEAR_CODE_NOTES[17], note: "" };
  }

  if (gear === "Vapapyydys tai vetouistin" || normalizedGear === "Vapaväline") {
    return { code: "18", label: OFFICIAL_GEAR_CODE_NOTES[18], note: "" };
  }

  return {
    code: "13",
    label: OFFICIAL_GEAR_CODE_NOTES[13],
    note: gear === "Muu" ? "Pyydys ilmoitetaan virallisessa raportissa Muu pyydys -luokkana." : "",
  };
}

function buildOfficialCatchWorkbook(entries = [], reportDateLabel = "kaikki", fisherProfile = null) {
  const sortedEntries = [...entries].sort((left, right) => {
    const dateDiff = String(left?.date || "").localeCompare(String(right?.date || ""));
    if (dateDiff !== 0) return dateDiff;
    return String(left?.createdAt || "").localeCompare(String(right?.createdAt || ""));
  });

  const areaLabels = [];
  const landingLabels = [];
  const areaNumberMap = new Map();
  const landingNumberMap = new Map();

  sortedEntries.forEach((entry) => {
    const areaLabel = getOfficialCatchAreaLabel(entry);
    if (areaLabel && !areaNumberMap.has(areaLabel)) {
      areaLabels.push(areaLabel);
      areaNumberMap.set(areaLabel, String(areaLabels.length));
    }

    const landingLabel = getOfficialLandingPlaceLabel(entry);
    if (landingLabel && !landingNumberMap.has(landingLabel)) {
      landingLabels.push(landingLabel);
      landingNumberMap.set(landingLabel, String(landingLabels.length));
    }
  });

  const fisherVesselIds = getCommercialFishingVesselIds(fisherProfile || {});
  const fisherInfoRows = fisherProfile ? [
    ["Kalastajan tiedot"],
    ["Nimi", fisherProfile.display_name || "-"],
    ["Yritys", fisherProfile.company_name || "-"],
    ["Y-tunnus", fisherProfile.business_id || "-"],
    ["Kaupallisen kalastajan tunnus", fisherProfile.commercial_fishing_id || "-"],
    ["Kaupallisen kalastusaluksen tunnukset", fisherVesselIds.length > 0 ? fisherVesselIds.join(", ") : "-"],
    ["Osoite", [fisherProfile.address, fisherProfile.postcode, fisherProfile.city].filter(Boolean).join(", ") || "-"],
    ["Sähköposti", fisherProfile.contact_email || fisherProfile.email || "-"],
    ["Puhelin", fisherProfile.phone || "-"],
    [],
  ] : [];

  const instructionsRows = [
    ["Virallinen saalisilmoitusraportti (sisävesikalastus)"],
    ["Valittu aikaväli", reportDateLabel],
    [],
    ...fisherInfoRows,
    ["Huomiot"],
    ["- Saalis ilmoitetaan pyyntipäivittäin, kalastamisalueittain ja pyydyksittäin."],
    ["- Tässä raportissa saaliskilot pyöristetään täysiin kiloihin virallisen ohjeen mukaisesti."],
    ["- Nykyinen appi tallentaa kaupankäyntiä varten myös desimaalikilojen tiedon, joka säilytetään erillisessä sarakkeessa vertailua varten."],
    ["- Jos pyydyskoodia ei voitu päätellä varmasti, Huomio viralliseen ilmoitukseen -sarakkeessa kerrotaan miksi."],
    [],
    ["Pyydyskoodisto"],
    ["Koodi", "Selite"],
    ...Object.entries(OFFICIAL_GEAR_CODE_NOTES).map(([code, label]) => [code, label]),
  ];

  const areaRows = [
    ["Kalastamisalueet"],
    ["Kalastamisalueen nro", "Kalastamisalue"],
    ...areaLabels.map((label, index) => [String(index + 1), label]),
  ];

  const landingRows = [
    ["Purkamispaikat"],
    ["Purkamispaikan nro", "Purkamispaikka"],
    ...landingLabels.map((label, index) => [String(index + 1), label]),
  ];

  const reportRows = [
    [
      "Kalastuspäivä",
      "KAL-tunnus / ilman alusta",
      "Kalastamisalueen nro",
      "Kalastamisalue",
      "Pyydyskoodi",
      "Pyydys",
      "Pyydysten määrä",
      "Pyyntiaika / pyyntipäivät",
      "Purkamispaikan nro",
      "Purkamispaikka",
      "Laji",
      "Muu laji erittely",
      "Saalis kg (virallinen)",
      "Saalis kg (appissa)",
      "Lukumäärä kpl",
      "Huomio viralliseen ilmoitukseen",
    ],
    ...sortedEntries.map((entry) => {
      const areaLabel = getOfficialCatchAreaLabel(entry);
      const landingLabel = getOfficialLandingPlaceLabel(entry);
      const gearInfo = getOfficialGearCodeInfo(entry);
      const speciesLabel = formatSpeciesForLabelTitle(entry?.species || "");
      const speciesMetadata = getSpeciesMetadata(entry?.species || "");
      const isOtherSpecies = normalizeFishSpeciesLabel(entry?.species) === "muu" || !speciesMetadata;
      const otherSpeciesDetail = isOtherSpecies ? formatSpeciesForSale(entry?.species || "") : "";
      const vesselLabel = String(entry?.commercialFishingVesselId || "").trim() || "Kalastus ilman alusta";
      const kilos = Number(entry?.kilos || 0);
      const count = Number(entry?.count || 0);

      return [
        entry?.date || "",
        vesselLabel,
        areaNumberMap.get(areaLabel) || "",
        areaLabel || "-",
        gearInfo.code || "",
        String(entry?.gear || "").trim() || "-",
        String(entry?.gearCount || "").trim() || "",
        String(entry?.fishingDurationDays || "").trim() || "",
        landingNumberMap.get(landingLabel) || "",
        landingLabel || "-",
        isOtherSpecies ? "Muu laji" : speciesLabel,
        otherSpeciesDetail,
        toWholeKilo(kilos),
        kilos,
        count > 0 ? count : "",
        gearInfo.note || "",
      ];
    }),
  ];

  return [
    { name: "Ohjeet", rows: instructionsRows },
    { name: "Kalastamisalueet", rows: areaRows },
    { name: "Purkamispaikat", rows: landingRows },
    { name: "Saalistiedot", rows: reportRows },
  ];
}

function runLocalTests() {
  const tests = [
    { name: "Kuha on kalalistassa", pass: fishSpecies.includes("Kuha") },
    { name: "Nuotta on pyydyslistassa", pass: gearTypes.some((gear) => gear.startsWith("Nuotta")) },
    { name: "Merta on pyydyslistassa", pass: gearTypes.includes("Merta") },
    { name: "Muu on vesialuelistassa", pass: defaultAreas.includes("Muu") },
    { name: "Refresh token -virhe tunnistuu", pass: isMissingRefreshTokenError(new Error("Invalid Refresh Token: Refresh Token Not Found")) },
  ];
  const failed = tests.filter((test) => !test.pass);
  if (failed.length > 0) {
    console.error("Paikalliset testit epäonnistuivat:", failed);
  }
}

async function getSessionWithTimeout(timeoutMs = 5000) {
  return await Promise.race([
    supabase.auth.getSession(),
    new Promise((_, reject) => {
      window.setTimeout(() => {
        reject(new Error("SESSION_INIT_TIMEOUT"));
      }, timeoutMs);
    }),
  ]);
}

function MunicipalitySelect({ value, onChange, placeholder = "Valitse paikkakunta" }) {
  return (
    <select style={styles.input} value={value} onChange={onChange}>
      <option value="">{placeholder}</option>
      {finlandMunicipalities.map((municipality) => (
        <option key={municipality} value={municipality}>
          {municipality}
        </option>
      ))}
    </select>
  );
}

function MultiCityInput({ value, onChange, suggestions = [], label = "Valitut kaupungit" }) {
  const [selectedCity, setSelectedCity] = useState("");
  const selectedCities = normalizeDestinationCities(value);
  const quickSuggestions = normalizeDestinationCities(suggestions).filter((city) => !selectedCities.includes(city)).slice(0, 8);

  const addCity = (city) => {
    const normalized = String(city || "").trim();
    if (!normalized) return;
    onChange(normalizeDestinationCities([...selectedCities, normalized]));
    setSelectedCity("");
  };

  const removeCity = (city) => {
    onChange(selectedCities.filter((item) => item !== city));
  };

  return (
    <div style={{ ...styles.stack, gap: 10 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ minWidth: 220, flex: "1 1 260px" }}>
          <MunicipalitySelect value={selectedCity} onChange={(e) => setSelectedCity(e.target.value)} placeholder="Valitse kaupunki" />
        </div>
        <button type="button" style={styles.button} onClick={() => addCity(selectedCity)} disabled={!selectedCity}>
          Lisää kaupunki
        </button>
      </div>
      {quickSuggestions.length > 0 ? (
        <div style={{ ...styles.stack, gap: 6 }}>
          <div style={styles.small}>Nopeat ehdotukset</div>
          <div style={styles.checkboxRow}>
            {quickSuggestions.map((city) => (
              <button key={city} type="button" style={styles.button} onClick={() => addCity(city)}>
                {city}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div style={{ ...styles.stack, gap: 6 }}>
        <div style={styles.small}>{label}</div>
        {selectedCities.length === 0 ? (
          <div style={styles.noticeInfo}>Ei vielä valittuja kaupunkeja.</div>
        ) : (
          <div style={styles.checkboxRow}>
            {selectedCities.map((city) => (
              <button key={city} type="button" style={styles.checkboxCard} onClick={() => removeCity(city)}>
                {city} x
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LandingPlaceInput({ value, onChange, options, placeholder = "Esim. Kyläniemen kalasatama" }) {
  return (
    <>
      <input
        style={styles.input}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        list="landing-place-options"
      />
      <datalist id="landing-place-options">
        {(options || []).map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </>
  );
}

function RememberedTextInput({ value, onChange, options, placeholder = "", listId }) {
  return (
    <>
      <input
        style={styles.input}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        list={listId}
      />
      <datalist id={listId}>
        {(options || []).map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </>
  );
}

function FishSpeciesInput({ value, onChange, placeholder = "Valitse tai kirjoita kalalaji" }) {
  return (
      <select style={styles.input} value={value} onChange={onChange}>
        <option value="">{placeholder}</option>
        {fishSpecies.map((species) => (
          <option key={species} value={species}>{species}</option>
        ))}
      </select>
  );
}

function FirstUseGuideCard({ profile, guideState, onDismissNow, onHideForever, viewportWidth }) {
  const guide = getRoleOnboardingGuideContent(profile?.role);
  if (!guide || !guideState?.visible) return null;
  const onboardingStepsStyle = responsiveGridStyle(styles.onboardingSteps, viewportWidth);

  return (
    <div style={{ ...styles.card, ...styles.sectionCard, ...styles.onboardingCard, ...styles.stack, marginBottom: 16 }}>
      <div style={styles.rowBetween}>
        <div>
          <div style={styles.onboardingEyebrow}>Ensimmäisten käyttökertojen ohje</div>
          <strong style={styles.onboardingTitle}>{guide.title}</strong>
          <div style={{ ...styles.muted, marginTop: 6 }}>{guide.intro}</div>
        </div>
        <span style={styles.badge}>Rooli: {roleLabel(profile?.role)}</span>
      </div>

      <div style={onboardingStepsStyle}>
        {guide.steps.map((step, index) => (
          <div key={`${profile?.role || "role"}-${index}`} style={styles.onboardingStep}>
            <span style={styles.onboardingStepNumber}>{index + 1}</span>
            <div style={styles.onboardingStepText}>{step}</div>
          </div>
        ))}
      </div>

      <div style={styles.row}>
        <button type="button" style={styles.button} onClick={onDismissNow}>
          Sulje nyt
        </button>
        <button type="button" style={{ ...styles.button, ...styles.primaryButton }} onClick={onHideForever}>
          Älä näytä enää
        </button>
      </div>
    </div>
  );
}

function PublicBatchView({ batchId, data, loading, error }) {
  const headerSummary = [formatSpeciesForSale(data?.species), data?.quantity != null && data?.quantity !== "" ? `${data.quantity} ${data.unit || "kg"}` : ""]
    .filter(Boolean)
    .join(" · ");
  const infoRows = [
    ["Erätunnus", data?.batch_id],
    ["Tila", data?.status],
    ["Laji", formatSpeciesForSale(data?.species)],
    ["Tuote", data?.product_name],
    ["Käsittelymenetelmä", data?.processing_method],
    ["Pyyntipäivämäärä", data?.catch_date],
    ["Tuotantopäivä", data?.production_date],
    ["Parasta ennen", data?.best_before_date],
    ["Alue", data?.area],
    ["Paikka", [data?.municipality, data?.spot].filter(Boolean).join(" / ")],
    ["Pyydys", data?.gear],
    ["Määrä", data?.quantity != null && data?.quantity !== "" ? `${data.quantity} ${data.unit || "kg"}` : ""],
    ["Myyjä / jalostaja", data?.seller_name],
    ["Luotu", data?.created_at ? new Date(data.created_at).toLocaleString("fi-FI") : ""],
  ].filter(([, value]) => value);

  const processingRows = [
    ["Tuotetyyppi", data?.related_processing?.product_type],
    ["Pakkauskoko", data?.related_processing?.package_size_g ? `${data.related_processing.package_size_g} g` : ""],
    ["Pakkausten määrä", data?.related_processing?.package_count],
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");

  return (
    <div style={styles.app}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .print-card { box-shadow: none !important; border-color: #cbd5e1 !important; break-inside: avoid; }
        }

        .public-batch-header {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
          flex-wrap: wrap;
        }

        .public-batch-row {
          display: grid;
          grid-template-columns: 220px minmax(0, 1fr);
          gap: 12px;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 8px;
        }

        .public-batch-value {
          min-width: 0;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .public-batch-source {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
          flex-wrap: wrap;
        }

        @media (max-width: 640px) {
          .public-batch-row {
            grid-template-columns: 1fr;
            gap: 4px;
          }

          .public-batch-header {
            gap: 12px;
          }

          .public-batch-source {
            gap: 12px;
          }
        }
      `}</style>
      <div style={{ ...styles.container, maxWidth: 960 }}>
        <div style={{ ...styles.card, ...styles.headerCard, marginBottom: 16, background: "linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)" }} className="print-card">
          <div className="public-batch-header">
            <div>
              <div style={{ fontSize: 14, color: "#1d4ed8", fontWeight: 700, marginBottom: 6 }}>Erän jäljitettävyys</div>
              <h1 style={{ ...styles.title, marginBottom: 8 }}>ERÄTIEDOT</h1>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{batchId}</div>
              {headerSummary ? <div style={{ marginTop: 8, fontSize: 18, color: "#0f172a", fontWeight: 700 }}>{headerSummary}</div> : null}
            </div>
            <div className="no-print" style={styles.row}>
              <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => window.print()}>
                Print batch information
              </button>
            </div>
          </div>
        </div>

        {loading ? <div style={{ ...styles.card, ...styles.sectionCard }} className="print-card">Haetaan erän tietoja...</div> : null}
        {error ? <div style={{ ...styles.noticeError, marginBottom: 16 }}>{error}</div> : null}

        {!loading && !error && data ? (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }} className="print-card">
              <strong style={{ fontSize: 20 }}>Erän perustiedot</strong>
              {infoRows.map(([label, value]) => (
                <div key={label} className="public-batch-row">
                  <div style={{ color: "#475569", fontWeight: 600 }}>{label}</div>
                  <div className="public-batch-value" style={{ color: "#0f172a" }}>{String(value)}</div>
                </div>
              ))}
            </div>

            {processingRows.length > 0 ? (
              <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }} className="print-card">
                <strong style={{ fontSize: 20 }}>Jalostustiedot</strong>
                {processingRows.map(([label, value]) => (
                  <div key={label} className="public-batch-row">
                    <div style={{ color: "#475569", fontWeight: 600 }}>{label}</div>
                    <div className="public-batch-value" style={{ color: "#0f172a" }}>{String(value)}</div>
                  </div>
                ))}
              </div>
            ) : null}

            {Array.isArray(data?.source_batches) && data.source_batches.length > 0 ? (
              <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }} className="print-card">
                <strong style={{ fontSize: 20 }}>Raaka-aine-erät</strong>
                {data.source_batches.map((source) => (
                  <div key={`${source.batch_id}-${source.source_entry_id || source.species || Math.random()}`} style={{ ...styles.entry, background: "#f8fbff" }}>
                    <div className="public-batch-source">
                      <div style={{ ...styles.stack, gap: 6 }}>
                        <div><strong>Erätunnus:</strong> {source.batch_id || "-"}</div>
                        <div style={styles.muted}><strong>Laji:</strong> {formatSpeciesForSale(source.species)}</div>
                        {source.catch_date ? <div style={styles.muted}><strong>Pyyntipäivämäärä:</strong> {source.catch_date}</div> : null}
                        <div style={styles.muted}><strong>Määrä:</strong> {source.kilos != null && source.kilos !== "" ? `${source.kilos} kg` : "-"}</div>
                      </div>
                      {source.qr_image_url ? (
                        <div className="no-print" style={styles.qrBlock}>
                          <img src={source.qr_image_url} alt={`QR ${source.batch_id || "source"}`} style={styles.qrImage} />
                          <div style={styles.small}>QR-koodi lähde-erälle</div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

          </div>
        ) : null}

      </div>
    </div>
  );
}

function CatchLabelPrintModal({ entry, profile, labelCount, setLabelCount, printFormat, setPrintFormat, waterType, setWaterType, onClose, onGeneratePdf, onPrint, viewportWidth }) {
  if (!entry) return null;

  const previewLabel = {
    ...buildCatchLabelData(entry, profile, 1, Math.max(1, Number(labelCount || 1)), { waterType }),
    qrImageUrl: getCatchLabelQrImageUrl(buildCatchLabelData(entry, profile, 1, Math.max(1, Number(labelCount || 1)), { waterType })),
    logoUrl: getAppLogoUrl(),
  };
  const isMobile = viewportWidth < 768;
  const isThermalFormat = isThermalCatchLabelFormat(printFormat);
  const thermalPreviewBaseWidth = printFormat === CATCH_LABEL_FORMAT_MUNBYN_4X3 ? 420 : 386;
  const previewBaseWidth = isThermalFormat ? thermalPreviewBaseWidth : 420;
  const previewBaseHeight = isThermalFormat
    ? (previewBaseWidth * getThermalLabelSizeMm(printFormat).height) / getThermalLabelSizeMm(printFormat).width
    : (previewBaseWidth * 57) / 105;
  const previewScale = isMobile
    ? Math.min(1, Math.max(0.5, (viewportWidth - 52) / previewBaseWidth))
    : 1;
  const formatDetails = CATCH_LABEL_FORMATS.find((formatOption) => formatOption.value === printFormat) || CATCH_LABEL_FORMATS[0];
  const emitPrintSelection = useCallback(() => ({
    entry,
    labelCount: Math.max(1, Number(labelCount || 1)),
    printFormat,
    waterType,
  }), [entry, labelCount, printFormat, waterType]);

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(15, 23, 42, 0.45)",
      display: "flex",
      alignItems: isMobile ? "stretch" : "center",
      justifyContent: "center",
      padding: isMobile ? 8 : 20,
      zIndex: 2000,
    }} onClick={onClose}>
      <div style={{
        ...styles.card,
        width: isMobile ? "calc(100vw - 16px)" : "min(980px, 100%)",
        maxHeight: isMobile ? "calc(100dvh - 16px)" : "90vh",
        overflowY: "auto",
        overflowX: "hidden",
        padding: isMobile ? 14 : 24,
      }} onClick={(event) => event.stopPropagation()}>
        <div style={styles.rowBetween}>
          <div>
            <strong style={{ fontSize: 22 }}>Tulosta etiketit</strong>
            <div style={styles.muted}>Erätunnus: {entry.batchId}</div>
          </div>
          <button style={styles.button} onClick={onClose}>Sulje</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(280px, 1fr) minmax(320px, 1fr)", gap: 16, marginTop: 16, alignItems: "start" }}>
          <div style={{ ...styles.stack, gap: 14 }}>
            <div style={styles.field}>
              <label>Kalalaji</label>
              <input style={styles.input} value={formatSpeciesForSale(entry.species)} disabled />
            </div>
            <div style={styles.field}>
              <label>Pyyntipäivämäärä</label>
              <input style={styles.input} value={entry.date || "-"} disabled />
            </div>
            <div style={styles.field}>
              <label>Erätunnus</label>
              <input style={styles.input} value={entry.batchId || "-"} disabled />
            </div>
            {isThermalFormat ? (
              <div style={styles.field}>
                <label>Vesityyppi</label>
                <select style={styles.input} value={waterType} onChange={(e) => setWaterType(e.target.value)}>
                  <option value="">Valitse ennen tulostusta</option>
                  <option value={WATER_TYPE_FRESH}>Makea vesi</option>
                  <option value={WATER_TYPE_SEA}>Meri</option>
                </select>
              </div>
            ) : null}
            <div style={styles.field}>
              <label>Laatikoiden määrä</label>
              <input
                style={styles.input}
                type="number"
                min="1"
                step="1"
                value={labelCount}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  if (nextValue === "") {
                    setLabelCount("");
                    return;
                  }

                  setLabelCount(Math.max(1, Number(nextValue)));
                }}
              />
            </div>
            <div style={styles.field}>
              <label>Tulostuspohja</label>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                {CATCH_LABEL_FORMATS.map((formatOption) => {
                  const isActive = formatOption.value === printFormat;
                  return (
                    <button
                      key={formatOption.value}
                      type="button"
                      onClick={() => {
                        setPrintFormat(formatOption.value);
                        setLabelCount(isThermalCatchLabelFormat(formatOption.value) ? 1 : 10);
                      }}
                      style={{
                        ...styles.button,
                        ...(isActive ? styles.primaryButton : {}),
                        padding: "14px 12px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        gap: 4,
                      }}
                    >
                      <span>{formatOption.label}</span>
                      <span style={{ fontSize: 12, opacity: isActive ? 0.95 : 0.8, fontWeight: 600, textAlign: "left" }}>{formatOption.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={styles.small}>{formatDetails.label} · {formatDetails.description}. “Luo PDF” avaa tulostusikkunan, jossa voit tallentaa PDF:n.</div>
            <div style={{ ...styles.row, flexWrap: "wrap" }}>
              <button type="button" style={{ ...styles.button, ...styles.primaryButton }} onClick={() => onGeneratePdf(emitPrintSelection())}>Luo PDF</button>
              <button type="button" style={styles.button} onClick={() => onPrint(emitPrintSelection())}>Tulosta</button>
            </div>
          </div>

          <div style={{ ...styles.card, background: "#f8fbff", padding: isMobile ? 10 : 18, minWidth: 0 }}>
            <div style={{ ...styles.small, marginBottom: 10 }}>Esikatselu</div>
            <div
              style={{
                overflow: "hidden",
                paddingBottom: 4,
                display: "flex",
                justifyContent: "center",
                alignItems: "flex-start",
                minHeight: previewBaseHeight * previewScale,
              }}
            >
              <div style={{
                width: previewBaseWidth,
                minWidth: previewBaseWidth,
                aspectRatio: isThermalFormat
                  ? `${getThermalLabelSizeMm(printFormat).width} / ${getThermalLabelSizeMm(printFormat).height}`
                  : "105 / 57",
                background: "#fff",
                padding: isThermalFormat ? 0 : 14,
                display: "grid",
                gridTemplateColumns: isThermalFormat ? "1fr" : "1fr 96px",
                gap: isThermalFormat ? 14 : 12,
                transform: `scale(${previewScale})`,
                transformOrigin: "top center",
              }}>
                {isThermalFormat ? (
                  renderThermalLabelByFormat(printFormat, previewLabel)
                ) : (
                  <>
                    <div style={{ display: "flex", flexDirection: "column", paddingLeft: 12, minWidth: 0 }}>
                      <div>
                        <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.03 }}>{previewLabel.species}</div>
                        {previewLabel.scientificName ? <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>{previewLabel.scientificName}</div> : null}
                        <div style={{ marginTop: 8, fontSize: 14, fontWeight: 800, padding: "6px 8px", background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: 8 }}>Erätunnus: {previewLabel.batchId}</div>
                        {previewLabel.catchArea ? <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.12 }}>Pyyntialue: {previewLabel.catchArea}</div> : null}
                        {previewLabel.harvestSourceText ? <div style={{ fontSize: 12, lineHeight: 1.12 }}>{previewLabel.harvestSourceText}</div> : null}
                        {previewLabel.gearType ? <div style={{ fontSize: 12, lineHeight: 1.12 }}>Pyyntimenetelmä: {previewLabel.gearType}</div> : null}
                        {previewLabel.productStateText ? <div style={{ fontSize: 12, lineHeight: 1.12 }}>{previewLabel.productStateText}</div> : null}
                        {previewLabel.catchDate ? <div style={{ fontSize: 14, lineHeight: 1.16, fontWeight: 700 }}>Pyyntipäivä: {previewLabel.catchDate}</div> : null}
                        {previewLabel.commercialFishingId ? <div style={{ fontSize: 12, lineHeight: 1.12 }}>Kaupallisen kalastajan tunnus: {previewLabel.commercialFishingId}</div> : null}
                        {previewLabel.productForm ? <div style={{ fontSize: 12, lineHeight: 1.12 }}>Tuote: {previewLabel.productForm}</div> : null}
                        <div style={{ fontSize: 12, lineHeight: 1.12 }}>Säilytys: 0–2 °C</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginTop: 12, minHeight: 24 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>Paino:</span>
                        <span style={{ flex: 1, borderBottom: "2px solid #0f172a", height: 18 }} />
                        <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>kg</span>
                      </div>
                      <div style={{ marginTop: "auto", fontSize: 12, lineHeight: 1.12 }}>
                        <div>Toimittaja: {previewLabel.supplier}</div>
                        {previewLabel.supplierAddress ? <div>{previewLabel.supplierAddress}</div> : null}
                        {previewLabel.supplierContact ? <div>{previewLabel.supplierContact}</div> : null}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 4 }}>
                        <img src={previewLabel.logoUrl} alt="Suoraan Kalastajalta" style={{ width: 48, height: 48, objectFit: "contain", marginBottom: 0 }} />
                        <div style={{ fontSize: 10, lineHeight: 1.05, fontWeight: 700, textAlign: "center", color: "#0f172a" }}>
                          <div>Suoraan</div>
                          <div>Kalastajalta</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-start", width: "100%" }}>
                        <img src={previewLabel.qrImageUrl} alt={`QR ${previewLabel.batchId}`} style={{ width: 82, height: 82, objectFit: "contain", border: "1px solid #cbd5e1", borderRadius: 8, padding: 4, background: "#fff" }} />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AuthView({ authMode, setAuthMode, authForm, setAuthForm, onSignIn, onSignUp, onForgotPassword, onResetRecoveredPassword, authError, authInfo, authSubmitting, viewportWidth }) {
  const logoHeight = viewportWidth < 768
    ? 172
    : viewportWidth < 1024
    ? 206
    : 228;

  return (
    <div style={styles.app}>
      <div style={{ ...styles.container, maxWidth: 520 }}>
        <div style={{ ...styles.card, ...styles.headerCard, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "nowrap", marginTop: 12, marginBottom: 12 }}>
            <h1 style={{ ...styles.title, marginRight: -2 }}>Suoraan Kalastajalta</h1>
            <img
              src="/logo.png"
              alt=""
              style={{
                height: logoHeight,
                width: "auto",
                maxWidth: viewportWidth < 768 ? "46vw" : "none",
                objectFit: "contain",
                display: "block",
                flexShrink: 0,
              }}
            />
          </div>
          <p style={styles.subtitle}>
            {authMode === "signup"
              ? "Luo tunnus kalastajalle tai ostajalle."
              : authMode === "recovery"
              ? "Aseta uusi salasana turvallisesti."
              : "Kirjaudu sisään jatkaaksesi sovellukseen."}
          </p>
        </div>
        <form
          style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}
          onSubmit={(e) => {
            e.preventDefault();
            if (authMode === "signin") {
              onSignIn();
            } else if (authMode === "recovery") {
              onResetRecoveredPassword();
            } else {
              onSignUp();
            }
          }}
        >
          {authMode !== "recovery" ? (
            <div style={{ ...styles.tabs6, gridTemplateColumns: "1fr 1fr", marginBottom: 0 }}>
              <button type="button" style={{ ...styles.tab, ...(authMode === "signin" ? styles.activeTab : {}) }} onClick={() => setAuthMode("signin")}>Kirjaudu</button>
              <button type="button" style={{ ...styles.tab, ...(authMode === "signup" ? styles.activeTab : {}) }} onClick={() => setAuthMode("signup")}>Rekisteröidy</button>
            </div>
          ) : (
            <div style={{ ...styles.card, padding: "12px 16px", background: "#eff6ff", border: "1px solid #93c5fd" }}>
              <strong>Aseta uusi salasana</strong>
              <div style={styles.muted}>Avaa sähköpostista tullut palautuslinkki ja aseta tähän uusi salasana.</div>
            </div>
          )}

          <div style={styles.field}>
            <label>Sähköposti</label>
            <input style={styles.input} type="email" value={authForm.email} onChange={(e) => setAuthForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="esim. nimi@yritys.fi" disabled={authMode === "recovery"} />
          </div>

          <div style={styles.field}>
            <label>{authMode === "recovery" ? "Uusi salasana" : "Salasana"}</label>
            <input style={styles.input} type="password" value={authForm.password} onChange={(e) => setAuthForm((prev) => ({ ...prev, password: e.target.value }))} placeholder={authMode === "recovery" ? "vähintään 8 merkkiä" : "salasana"} />
          </div>

          {authMode === "signup" ? (
            <>
              <div style={styles.field}>
                <label>Nimi</label>
                <input style={styles.input} value={authForm.displayName} onChange={(e) => setAuthForm((prev) => ({ ...prev, displayName: e.target.value }))} placeholder="Esim. Kala Yritys Oy" />
              </div>
              <div style={styles.field}>
                <label>Rooli</label>
                <select style={styles.input} value={authForm.requestedRole} onChange={(e) => setAuthForm((prev) => ({ ...prev, requestedRole: e.target.value }))}>
                  <option value="member">Kalastaja</option>
                  <option value="buyer">Ostaja</option>
                </select>
              </div>
            </>
          ) : null}

          {authMode === "recovery" ? (
            <div style={styles.field}>
              <label>Uusi salasana uudelleen</label>
              <input style={styles.input} type="password" value={authForm.confirmPassword} onChange={(e) => setAuthForm((prev) => ({ ...prev, confirmPassword: e.target.value }))} placeholder="kirjoita uusi salasana uudelleen" />
            </div>
          ) : null}

          {authError ? <div style={styles.noticeError}>{authError}</div> : null}
          {authInfo ? <div style={styles.noticeSuccess}>{authInfo}</div> : null}

          {authMode === "signin" ? (
            <>
              <button type="button" style={{ ...styles.button, ...styles.primaryButton }} onClick={onSignIn} disabled={authSubmitting}>
                {authSubmitting ? "Kirjaudutaan..." : "Kirjaudu sisään"}
              </button>
              <button type="button" style={styles.button} onClick={onForgotPassword} disabled={authSubmitting}>Unohditko salasanan?</button>
            </>
          ) : authMode === "recovery" ? (
            <button type="button" style={{ ...styles.button, ...styles.primaryButton }} onClick={onResetRecoveredPassword} disabled={authSubmitting}>
              {authSubmitting ? "Tallennetaan..." : "Tallenna uusi salasana"}
            </button>
          ) : (
            <button type="button" style={{ ...styles.button, ...styles.primaryButton }} onClick={onSignUp} disabled={authSubmitting}>
              {authSubmitting ? "Luodaan..." : "Luo tunnus"}
            </button>
          )}

          {authMode === "signup" ? <div style={styles.muted}>Ostaja ja kalastaja pääsevät appiin heti rekisteröitymisen jälkeen. Vain erikoisroolit voivat vaatia ylläpitäjän hyväksynnän.</div> : null}

        </form>
      </div>
    </div>
  );
}

function RoleSelectionView({ roleOptions, buyers, onSelectRole }) {
  return (
    <div style={styles.app}>
      <div style={{ ...styles.container, maxWidth: 560 }}>
        <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
          <h1 style={styles.title}>Valitse rooli</h1>
          <div style={styles.muted}>Tällä sähköpostilla on useita rooleja. Valitse millä roolilla haluat jatkaa.</div>
          <div style={{ ...styles.stack, marginTop: 8 }}>
            {roleOptions.map((option) => (
              <button
                key={option.id}
                style={{ ...styles.button, ...styles.primaryButton, justifyContent: "space-between", width: "100%" }}
                onClick={() => onSelectRole(option)}
              >
                <span>{buildRoleOptionLabel(option, buyers)}</span>
                <span>{option.display_name || option.email}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PendingApprovalView({ profile, onLogout }) {
  return (
    <div style={styles.app}>
      <div style={{ ...styles.container, maxWidth: 560 }}>
        <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
          <h1 style={styles.title}>Odottaa hyväksyntää</h1>
          <div style={styles.muted}>
            Tunnus on luotu sähköpostille <strong>{profile?.email || "-"}</strong>, mutta valittu rooli tarvitsee vielä ylläpitäjän hyväksynnän ennen kuin tämä näkymä aukeaa kokonaan.
          </div>
          <div style={styles.noticeInfo}>
            Valittu rooli: <strong>{roleLabel(profile?.role || "member")}</strong>
          </div>
          <div style={{ ...styles.row, justifyContent: "flex-end" }}>
            <button style={styles.button} onClick={onLogout}>Kirjaudu ulos</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function WholesaleOffersView({
  profile,
  saleEntries,
  offers,
  buyers = [],
  buyerOffers,
  offerForm,
  setOfferForm,
  onCreateOffer,
  onUpdateOfferStatus,
  onUpdateBuyerOfferStatus,
  onRemoveEntryFromSale,
  updateFulfillmentStatus,
  requestedOfferId,
  buyerTypeLabel,
  buyerStatusLabel,
  shouldRevealBuyerIdentity,
}) {
  const formatOfferDate = (value) => {
    if (!value) return "-";
    try {
      return new Date(value).toLocaleString("fi-FI", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return value;
    }
  };

  const getEntryReservation = (entry) => {
    const matches = (buyerOffers || []).filter((offer) => {
      if (!isBuyerOfferReserved(offer.status) && !isBuyerOfferAccepted(offer.status)) {
        return false;
      }

      if (offer.batch_id && entry.batchId) {
        return offer.batch_id === entry.batchId;
      }

      return (
        offer.seller_user_id === entry.ownerUserId &&
        offer.area === entry.area &&
        offer.spot === (entry.spot || "") &&
        Number(offer.total_kilos || 0) === Number(entry.kilos || 0)
      );
    });

    if (matches.length === 0) return null;

    return matches.sort(
      (a, b) =>
        new Date(b.updated_at || b.created_at || 0).getTime() -
        new Date(a.updated_at || a.created_at || 0).getTime()
    )[0];
  };

  const groupedBuyerOffers = saleEntries.map((entry) => {
    const reservation = getEntryReservation(entry);

    const batchMatches = (buyerOffers || []).filter((offer) => {
      if (!entry.batchId) return false;
      if (offer.batch_id && offer.batch_id === entry.batchId) return true;
      return getOfferSummaryBatchItems(offer.species_summary).some((item) => item.batchId === entry.batchId);
    });

    const entryMatches = (buyerOffers || []).filter((offer) => {
      if (offer.batch_id && entry.batchId) return false;

      return (
        offer.seller_user_id === entry.ownerUserId &&
        offer.area === entry.area &&
        offer.spot === (entry.spot || "") &&
        Number(offer.total_kilos || 0) === Number(entry.kilos || 0)
      );
    });

    return {
      entry,
      reservation,
      entryOffers: offers.filter((offer) => offer.entry_id === entry.id),
      buyerMatches: [...batchMatches, ...entryMatches].sort(
        (a, b) =>
          new Date(b.updated_at || b.created_at || 0).getTime() -
          new Date(a.updated_at || a.created_at || 0).getTime()
      ),
    };
  });
  const jumpToEntryOffer = (entryId) => {
    if (typeof document === "undefined") return;
    const target = document.getElementById(`offer-entry-${entryId}`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const offeredEntriesSummary = buildOpenOfferedEntriesSummary(groupedBuyerOffers, formatSpeciesForSale);
  const openOfferedEntriesSummary = offeredEntriesSummary.filter((item) => item.reservationStatus === "");
  const openBuyerOfferStatuses = BUYER_OFFER_OPEN_RESPONSE_STATUSES;
  const buyerResponsePriority = {
    reserved: 0,
    countered: 1,
    accepted: 2,
    rejected: 3,
  };

  const prioritizedBuyerResponses = (buyerOffers || [])
    .filter((offer) => hasBuyerOfferStatus(offer.status, [
      ...BUYER_OFFER_ACTION_REQUIRED_STATUSES,
      "accepted",
      "rejected",
    ]))
    .sort((a, b) => {
      if (requestedOfferId) {
        if (a.id === requestedOfferId && b.id !== requestedOfferId) return -1;
        if (b.id === requestedOfferId && a.id !== requestedOfferId) return 1;
      }
      const priorityDiff = (buyerResponsePriority[a.status] ?? 99) - (buyerResponsePriority[b.status] ?? 99);
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime();
    });
  const actionRequiredResponses = prioritizedBuyerResponses.filter((offer) => hasBuyerOfferStatus(offer.status, BUYER_OFFER_ACTION_REQUIRED_STATUSES));
  const acceptedBuyerResponses = prioritizedBuyerResponses.filter((offer) => isBuyerOfferAccepted(offer.status));
  const archivedBuyerResponses = prioritizedBuyerResponses.filter((offer) => isBuyerOfferRejected(offer.status));

  const canManageBuyerOffer = (offer) => profile?.role === "owner" || profile?.id === offer?.seller_user_id;
  const linkedBuyerOffer = requestedOfferId
    ? (buyerOffers || []).find((offer) => offer.id === requestedOfferId)
    : null;

  return (
    <div style={styles.stack}>
      <WholesaleOffersOverviewSection
        actionRequiredCount={actionRequiredResponses.length}
        openEntriesCount={openOfferedEntriesSummary.length}
        acceptedCount={acceptedBuyerResponses.length}
        archivedCount={archivedBuyerResponses.length}
        styles={styles}
      />

      <LinkedBuyerOfferCard
        linkedBuyerOffer={linkedBuyerOffer}
        buyerStatusLabel={buyerStatusLabel}
        shouldRevealBuyerIdentity={shouldRevealBuyerIdentity}
        buyerTypeLabel={buyerTypeLabel}
        formatSpeciesSummaryText={formatSpeciesSummaryText}
        getOfferSummaryCatchDates={getOfferSummaryCatchDates}
        isMixedOffer={isMixedOffer}
        getOfferSummaryBatchItems={getOfferSummaryBatchItems}
        getBatchQrImageUrl={getBatchQrImageUrl}
        styles={styles}
      />

      <OfferedEntriesSummarySection
        offeredEntriesSummary={openOfferedEntriesSummary}
        jumpToEntryOffer={jumpToEntryOffer}
        onRemoveEntryFromSale={onRemoveEntryFromSale}
        buyerStatusBadgeStyle={buyerStatusBadgeStyle}
        styles={styles}
        title="Avoimet tarjoukset"
        infoText="Tässä näkyvät erät, jotka on lähetetty ostajille ja jotka vielä odottavat vastausta. Selaa alaspäin niin näet toimenpiteitä vaativat kalaerät sekä hyväksytyt kaupat."
        emptyText="Ei tällä hetkellä avoimia, vastausta odottavia eriä."
      />

      <BuyerResponsesSection
        prioritizedBuyerResponses={actionRequiredResponses}
        requestedOfferId={requestedOfferId}
        buyers={buyers}
        buyerStatusLabel={buyerStatusLabel}
        buyerStatusBadgeStyle={buyerStatusBadgeStyle}
        shouldRevealBuyerIdentity={shouldRevealBuyerIdentity}
        buyerTypeLabel={buyerTypeLabel}
        formatSpeciesSummaryText={formatSpeciesSummaryText}
        getOfferSummaryCatchDates={getOfferSummaryCatchDates}
        isMixedOffer={isMixedOffer}
        getOfferSummaryBatchItems={getOfferSummaryBatchItems}
        getBatchQrImageUrl={getBatchQrImageUrl}
        euro={euro}
        canManageBuyerOffer={canManageBuyerOffer}
        onUpdateBuyerOfferStatus={onUpdateBuyerOfferStatus}
        styles={styles}
        formatOfferDate={formatOfferDate}
        title="Vaatii toimenpiteitä"
        infoText="Tässä näkyvät varaukset ja vastatarjoukset, joihin sinun kannattaa reagoida nyt."
        emptyText="Ei tällä hetkellä toimenpiteitä vaativia tarjouksia."
      />

      <BuyerResponsesSection
        prioritizedBuyerResponses={acceptedBuyerResponses}
        requestedOfferId={requestedOfferId}
        buyers={buyers}
        buyerStatusLabel={buyerStatusLabel}
        buyerStatusBadgeStyle={buyerStatusBadgeStyle}
        shouldRevealBuyerIdentity={shouldRevealBuyerIdentity}
        buyerTypeLabel={buyerTypeLabel}
        formatSpeciesSummaryText={formatSpeciesSummaryText}
        getOfferSummaryCatchDates={getOfferSummaryCatchDates}
        isMixedOffer={isMixedOffer}
        getOfferSummaryBatchItems={getOfferSummaryBatchItems}
        getBatchQrImageUrl={getBatchQrImageUrl}
        euro={euro}
        canManageBuyerOffer={canManageBuyerOffer}
        onUpdateBuyerOfferStatus={onUpdateBuyerOfferStatus}
        styles={styles}
        formatOfferDate={formatOfferDate}
        title="Hyväksytyt kaupat"
        infoText="Tässä näkyvät hyväksytyt kaupat, jotka etenevät toimitukseen ja myöhemmin laskutukseen."
        emptyText="Ei vielä hyväksyttyjä kauppoja."
      />

      <BuyerResponsesSection
        prioritizedBuyerResponses={archivedBuyerResponses}
        requestedOfferId={requestedOfferId}
        buyers={buyers}
        buyerStatusLabel={buyerStatusLabel}
        buyerStatusBadgeStyle={buyerStatusBadgeStyle}
        shouldRevealBuyerIdentity={shouldRevealBuyerIdentity}
        buyerTypeLabel={buyerTypeLabel}
        formatSpeciesSummaryText={formatSpeciesSummaryText}
        getOfferSummaryCatchDates={getOfferSummaryCatchDates}
        isMixedOffer={isMixedOffer}
        getOfferSummaryBatchItems={getOfferSummaryBatchItems}
        getBatchQrImageUrl={getBatchQrImageUrl}
        euro={euro}
        canManageBuyerOffer={canManageBuyerOffer}
        onUpdateBuyerOfferStatus={onUpdateBuyerOfferStatus}
        styles={styles}
        formatOfferDate={formatOfferDate}
        title="Arkisto"
        infoText="Tässä näkyvät hylätyt tarjoukset. Näet historian, mutta nämä eivät enää vaadi toimenpiteitä."
        emptyText="Arkistossa ei ole vielä hylättyjä tarjouksia."
      />

      <OfferedEntriesDetailsSection
        groupedBuyerOffers={groupedBuyerOffers}
        openBuyerOfferStatuses={openBuyerOfferStatuses}
        requestedOfferId={requestedOfferId}
        buyers={buyers}
        profile={profile}
        buyerStatusLabel={buyerStatusLabel}
        buyerStatusBadgeStyle={buyerStatusBadgeStyle}
        shouldRevealBuyerIdentity={shouldRevealBuyerIdentity}
        buyerTypeLabel={buyerTypeLabel}
        formatSpeciesSummaryText={formatSpeciesSummaryText}
        getOfferSummaryCatchDates={getOfferSummaryCatchDates}
        isMixedOffer={isMixedOffer}
        getOfferSummaryBatchItems={getOfferSummaryBatchItems}
        getBatchQrImageUrl={getBatchQrImageUrl}
        formatCatchGearDisplay={formatCatchGearDisplay}
        formatDeliveryPrice={formatDeliveryPrice}
        euro={euro}
        calculateCommissionDetails={calculateCommissionDetails}
        fulfillmentStatusLabel={fulfillmentStatusLabel}
        onUpdateBuyerOfferStatus={onUpdateBuyerOfferStatus}
        onUpdateOfferStatus={onUpdateOfferStatus}
        updateFulfillmentStatus={updateFulfillmentStatus}
        canManageBuyerOffer={canManageBuyerOffer}
        styles={styles}
        formatOfferDate={formatOfferDate}
        COMMISSION_RATE={COMMISSION_RATE}
        formatSpeciesForSale={formatSpeciesForSale}
        title="Eräkohtainen näkymä"
      />
    </div>
  );
}

function ReportsView({ entries, processedEntries, offers, profile }) {
  const [reportStartDate, setReportStartDate] = useState("");
  const [reportEndDate, setReportEndDate] = useState("");
  const [reportEmail, setReportEmail] = useState("");
  const [reportSendingKey, setReportSendingKey] = useState("");
  const [buyerSpeciesPeriod, setBuyerSpeciesPeriod] = useState("month");
  const [buyerReportLoading, setBuyerReportLoading] = useState(false);
  const [buyerReportError, setBuyerReportError] = useState("");
  const [buyerReportData, setBuyerReportData] = useState(null);

  const isBuyerRole = profile?.role === "buyer";
  const hasFisherPremium = isFisherPremiumProfile(profile);
  const reportDateLabel = reportStartDate || reportEndDate
    ? `${reportStartDate || "alku"} - ${reportEndDate || "tänään"}`
    : "kaikki";

  const isWithinReportRange = (value) => {
    const normalizedValue = String(value || "").trim().slice(0, 10);
    if (!normalizedValue) return !reportStartDate && !reportEndDate;
    if (reportStartDate && normalizedValue < reportStartDate) return false;
    if (reportEndDate && normalizedValue > reportEndDate) return false;
    return true;
  };

  const resolveReportEmail = () => {
    const existingEmail = normalizeEmail(reportEmail);
    if (existingEmail) return existingEmail;
    const promptedEmail = window.prompt("Anna sähköpostiosoite, johon raportti lähetetään:", "");
    const normalizedPromptedEmail = normalizeEmail(promptedEmail);
    if (!normalizedPromptedEmail) {
      throw new Error("Lisää sähköpostiosoite, johon raportti lähetetään.");
    }
    setReportEmail(normalizedPromptedEmail);
    return normalizedPromptedEmail;
  };

  const sendReportEmail = async ({ filename, rows, sheetName, reportLabel }) => {
    const normalizedEmail = resolveReportEmail();

    const workbookArray = buildSpreadsheetArray(rows, sheetName);
    const blob = new Blob([workbookArray], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const dataUrl = await blobToDataUrl(blob);
    const base64Content = String(dataUrl || "").split(",")[1] || "";
    if (!base64Content) {
      throw new Error("Raporttitiedoston muodostus epäonnistui.");
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) {
      throw new Error("Istunto puuttuu. Kirjaudu uudelleen ennen raportin lähetystä.");
    }

    const result = await invokeEdgeFunctionAuthenticated("send-report-email", {
      toEmail: normalizedEmail,
      fileName: filename,
      fileBase64: base64Content,
      reportLabel,
      dateRangeLabel: reportDateLabel,
    }, accessToken);

    if (result?.error) {
      throw new Error(result.error.message || "Raportin lähetys epäonnistui.");
    }
  };

  useEffect(() => {
    if (!isBuyerRole) return undefined;

    let active = true;

    const loadBuyerReport = async () => {
      setBuyerReportLoading(true);
      setBuyerReportError("");

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token;
        if (!accessToken) {
          throw new Error("Istunto puuttuu. Kirjaudu uudelleen ennen raportin avaamista.");
        }

        const result = await fetchBuyerReport(accessToken);
        if (result?.error) {
          throw new Error(result.error.message || "Ostoraportin haku epäonnistui.");
        }

        if (!active) return;
        setBuyerReportData(result?.data?.report || null);
      } catch (error) {
        if (!active) return;
        setBuyerReportError(String(error?.message || error));
      } finally {
        if (active) setBuyerReportLoading(false);
      }
    };

    void loadBuyerReport();

    return () => {
      active = false;
    };
  }, [isBuyerRole]);

  const buyerPurchases = useMemo(() => {
    if (!isBuyerRole) return [];
    return (buyerReportData?.purchases || []).filter((purchase) => isWithinReportRange(purchase.purchaseDate));
  }, [buyerReportData, isBuyerRole, reportStartDate, reportEndDate]);

  const buyerPurchaseSpeciesRows = useMemo(() => {
    if (!isBuyerRole) return [];

    return buyerPurchases.flatMap((purchase) => {
      const lineItems = parseSellerInvoiceLineItems({
        species_summary: purchase.speciesSummary,
        buyer_message: purchase.buyerMessage,
        notes: purchase.notes,
        counter_price_per_kg: purchase.counterPricePerKg,
        price_per_kg: purchase.pricePerKg,
        reserved_kilos: purchase.reservedKilos,
        total_kilos: purchase.totalKilos || purchase.quantityKg,
      });
      const isSingleSpeciesOffer = getOfferSummaryLines(purchase.speciesSummary).length <= 1;
      const singleSpeciesFallbackPrice = isSingleSpeciesOffer
        ? Number(
          purchase.unitPriceEur ||
          purchase.counterPricePerKg ||
          purchase.pricePerKg ||
          parsePricePerKgFromNotes(purchase.notes) ||
          0
        )
        : 0;

      return lineItems
        .filter((item) => String(item?.unit || "kg").toLowerCase() === "kg")
        .map((item) => {
          const species = formatSpeciesForSale(item.description).split(":")[0].trim() || "Kalaerä";
          const quantityKg = Number(item.quantity || 0);
          const parsedUnitPrice = Number(item.unitPrice || 0);
          const averageUnitPriceEur = parsedUnitPrice > 0
            ? parsedUnitPrice
            : singleSpeciesFallbackPrice;
          return {
            purchaseDate: purchase.purchaseDate,
            month: purchase.month,
            species,
            quantityKg,
            averageUnitPriceEur,
            tradeValueEur: quantityKg * averageUnitPriceEur,
          };
        })
        .filter((item) => item.species && item.quantityKg > 0);
    });
  }, [buyerPurchases, isBuyerRole]);

  const buyerSummary = useMemo(() => {
    if (!isBuyerRole) {
      return {
        purchaseCount: 0,
        totalQuantityKg: 0,
        totalTradeValueEur: 0,
        totalDeliveryCostEur: 0,
        totalValueEur: 0,
        latestPurchaseAt: "",
        topSpecies: [],
        topAreas: [],
        monthly: [],
      };
    }

    const speciesMap = new Map();
    const areaMap = new Map();
    const monthlyMap = new Map();
    let totalQuantityKg = 0;
    let totalTradeValueEur = 0;
    let totalDeliveryCostEur = 0;

    buyerPurchases.forEach((purchase) => {
      totalQuantityKg += Number(purchase.quantityKg || 0);
      totalTradeValueEur += Number(purchase.tradeValueEur || 0);
      totalDeliveryCostEur += Number(purchase.deliveryCostEur || 0);

      const areaKey = [purchase.area, purchase.spot].filter(Boolean).join(" / ") || "Vesialue puuttuu";
      const areaRow = areaMap.get(areaKey) || {
        areaLabel: areaKey,
        purchaseCount: 0,
        quantityKg: 0,
        tradeValueEur: 0,
      };
      areaRow.purchaseCount += 1;
      areaRow.quantityKg += Number(purchase.quantityKg || 0);
      areaRow.tradeValueEur += Number(purchase.tradeValueEur || 0);
      areaMap.set(areaKey, areaRow);

      const monthKey = String(purchase.month || "").trim();
      if (monthKey) {
        const monthRow = monthlyMap.get(monthKey) || {
          month: monthKey,
          purchaseCount: 0,
          quantityKg: 0,
          tradeValueEur: 0,
        };
        monthRow.purchaseCount += 1;
        monthRow.quantityKg += Number(purchase.quantityKg || 0);
        monthRow.tradeValueEur += Number(purchase.tradeValueEur || 0);
        monthlyMap.set(monthKey, monthRow);
      }
    });

    buyerPurchaseSpeciesRows.forEach((row) => {
      const speciesRow = speciesMap.get(row.species) || {
        species: row.species,
        purchaseCount: 0,
        quantityKg: 0,
        tradeValueEur: 0,
        averageUnitPriceEur: 0,
      };
      speciesRow.purchaseCount += 1;
      speciesRow.quantityKg += Number(row.quantityKg || 0);
      speciesRow.tradeValueEur += Number(row.tradeValueEur || 0);
      speciesRow.averageUnitPriceEur = speciesRow.quantityKg > 0 ? speciesRow.tradeValueEur / speciesRow.quantityKg : 0;
      speciesMap.set(row.species, speciesRow);
    });

    return {
      purchaseCount: buyerPurchases.length,
      totalQuantityKg,
      totalTradeValueEur,
      totalDeliveryCostEur,
      totalValueEur: totalTradeValueEur + totalDeliveryCostEur,
      latestPurchaseAt: buyerPurchases[0]?.purchaseDate || "",
      topSpecies: Array.from(speciesMap.values()).sort((left, right) => right.tradeValueEur - left.tradeValueEur),
      topAreas: Array.from(areaMap.values()).sort((left, right) => right.tradeValueEur - left.tradeValueEur),
      monthly: Array.from(monthlyMap.values()).sort((left, right) => left.month.localeCompare(right.month)),
    };
  }, [buyerPurchaseSpeciesRows, buyerPurchases, isBuyerRole]);

  const buyerSpeciesByPeriod = useMemo(() => {
    if (!isBuyerRole) return [];

    const periodMap = new Map();

    buyerPurchaseSpeciesRows.forEach((purchase) => {
      const rawDate = String(purchase.purchaseDate || "").trim();
      if (!rawDate) return;

      const periodKey = buyerSpeciesPeriod === "year"
        ? rawDate.slice(0, 4)
        : rawDate.slice(0, 7);
      if (!periodKey) return;

      const currentPeriod = periodMap.get(periodKey) || new Map();
      const speciesRow = currentPeriod.get(purchase.species) || {
        species: purchase.species,
        quantityKg: 0,
        tradeValueEur: 0,
        averageUnitPriceEur: 0,
      };

      speciesRow.quantityKg += Number(purchase.quantityKg || 0);
      speciesRow.tradeValueEur += Number(purchase.tradeValueEur || 0);
      speciesRow.averageUnitPriceEur = speciesRow.quantityKg > 0 ? speciesRow.tradeValueEur / speciesRow.quantityKg : 0;
      currentPeriod.set(purchase.species, speciesRow);
      periodMap.set(periodKey, currentPeriod);
    });

    return Array.from(periodMap.entries())
      .sort((left, right) => right[0].localeCompare(left[0]))
      .map(([periodKey, speciesMap]) => ({
        periodKey,
        items: Array.from(speciesMap.values()).sort((left, right) => right.quantityKg - left.quantityKg),
      }));
  }, [buyerPurchaseSpeciesRows, buyerSpeciesPeriod, isBuyerRole]);

  if (isBuyerRole) {
    const buyerInfo = buyerReportData?.buyer || {};
    const formatReportDate = (value) => {
      if (!value) return "-";
      try {
        return new Date(value).toLocaleDateString("fi-FI", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });
      } catch {
        return String(value);
      }
    };

    const formatMonthLabel = (value) => {
      if (!value) return "-";
      try {
        return new Intl.DateTimeFormat("fi-FI", {
          year: "numeric",
          month: "long",
        }).format(new Date(`${value}-01T00:00:00`));
      } catch {
        return String(value);
      }
    };

    const formatPeriodLabel = (value) => buyerSpeciesPeriod === "year" ? value : formatMonthLabel(value);

    const formatCompactMoney = (value) => {
      const number = Number(value || 0);
      return `${number.toLocaleString("fi-FI", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;
    };

    const buyerReportRows = [
      [
        buyerSpeciesPeriod === "year" ? "Vuosi" : "Kuukausi",
        "Kalalaji",
        "Määrä kg",
        "Keskihinta ALV 0 %",
        `Keskihinta sis. ALV ${formatVatPercent()} %`,
      ],
      ...buyerSpeciesByPeriod.flatMap((periodGroup) =>
        periodGroup.items.map((row) => [
          formatPeriodLabel(periodGroup.periodKey),
          row.species,
          Number(row.quantityKg || 0),
          row.averageUnitPriceEur || 0,
          calculateGrossPrice(row.averageUnitPriceEur || 0) || 0,
        ]),
      ),
    ];

    return (
      <div style={styles.stack}>
        <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
          <div style={styles.rowBetween}>
            <div>
              <strong>Ostoraportit</strong>
              <div style={styles.muted}>Raportissa näytetään vain laji, määrä sekä keskihinnat.</div>
            </div>
            <div style={styles.row}>
              <button
                style={styles.button}
                onClick={async () => {
                  setBuyerReportLoading(true);
                  setBuyerReportError("");
                  try {
                    const { data: sessionData } = await supabase.auth.getSession();
                    const accessToken = sessionData?.session?.access_token;
                    if (!accessToken) {
                      throw new Error("Istunto puuttuu. Kirjaudu uudelleen.");
                    }
                    const result = await fetchBuyerReport(accessToken);
                    if (result?.error) {
                      throw new Error(result.error.message || "Ostoraportin päivitys epäonnistui.");
                    }
                    setBuyerReportData(result?.data?.report || null);
                    setAuthInfo("Ostoraportti päivitetty.");
                  } catch (error) {
                    setBuyerReportError(String(error?.message || error));
                    setAuthError(String(error?.message || error));
                  } finally {
                    setBuyerReportLoading(false);
                  }
                }}
              >
                {buyerReportLoading ? "Päivitetään..." : "Päivitä raportti"}
              </button>
            </div>
          </div>

          <div style={styles.noticeInfo}>
            Ostaja: {buyerInfo.companyName || buyerInfo.contactName || profile?.display_name || "-"}{buyerInfo.city ? ` · ${buyerInfo.city}` : ""}
            {"\n"}Valittu aikaväli: {reportDateLabel}
          </div>

          <div style={styles.stack}>
            <div style={styles.field}>
              <label>Alkupäivä</label>
              <input
                style={styles.input}
                type="date"
                value={reportStartDate}
                onChange={(e) => setReportStartDate(e.target.value)}
                max={reportEndDate || undefined}
              />
            </div>
            <div style={styles.field}>
              <label>Loppupäivä</label>
              <input
                style={styles.input}
                type="date"
                value={reportEndDate}
                onChange={(e) => setReportEndDate(e.target.value)}
                min={reportStartDate || undefined}
              />
            </div>
          </div>

          <div style={styles.field}>
            <label>Sähköposti raportin lähetykseen</label>
            <input
              style={styles.input}
              type="email"
              value={reportEmail}
              onChange={(e) => setReportEmail(e.target.value)}
              placeholder={buyerInfo.email || "esim. raportit@yritys.fi"}
            />
          </div>

          <div style={styles.row}>
            <button
              style={{ ...styles.button, ...styles.primaryButton }}
              onClick={() => { void exportSpreadsheet(`ostoraportti-${reportStartDate || "alku"}-${reportEndDate || today()}.xlsx`, buyerReportRows, "Ostoraportti"); }}
              disabled={buyerReportLoading || buyerPurchases.length === 0}
            >
              Lataa ostoraportti Exceliin
            </button>
            <button
              style={styles.button}
              onClick={() => {
                const filename = `ostoraportti-${reportStartDate || "alku"}-${reportEndDate || today()}.xlsx`;
                setReportSendingKey("buyer");
                void sendReportEmail({
                  filename,
                  rows: buyerReportRows,
                  sheetName: "Ostoraportti",
                  reportLabel: "Ostoraportti",
                })
                  .then(() => setAuthInfo(`Ostoraportti lähetetty osoitteeseen ${normalizeEmail(reportEmail)}.`))
                  .catch((error) => {
                    setBuyerReportError(String(error?.message || error));
                    setAuthError(String(error?.message || error));
                  })
                  .finally(() => setReportSendingKey(""));
              }}
              disabled={buyerReportLoading || buyerPurchases.length === 0 || reportSendingKey === "buyer"}
            >
              {reportSendingKey === "buyer" ? "Lähetetään..." : "Lähetä ostoraportti sähköpostiin"}
            </button>
          </div>
        </div>

        {buyerReportError ? <div style={styles.noticeError}>{buyerReportError}</div> : null}
        {buyerReportLoading && !buyerReportData ? <div style={styles.noticeInfo}>Haetaan ostoraporttia...</div> : null}

        <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
          <div style={styles.rowBetween}>
            <strong>Ostetuimmat lajit</strong>
            <select style={styles.input} value={buyerSpeciesPeriod} onChange={(e) => setBuyerSpeciesPeriod(e.target.value)}>
              <option value="month">Kuukausitaso</option>
              <option value="year">Vuositaso</option>
            </select>
          </div>
          {buyerSpeciesByPeriod.length === 0 ? <div style={styles.muted}>Ei vielä ostotietoja valitulla aikavälillä.</div> : buyerSpeciesByPeriod.map((periodGroup) => (
            <div key={periodGroup.periodKey} style={{ ...styles.entry, padding: 14 }}>
              <div style={{ ...styles.entryBadges, marginBottom: 12 }}>
                <span style={styles.badge}>{formatPeriodLabel(periodGroup.periodKey)}</span>
              </div>
              <div style={styles.stack}>
                {periodGroup.items.map((row) => (
                  <div key={`${periodGroup.periodKey}-${row.species}`} style={{ ...styles.muted, fontSize: 16 }}>
                    <strong>{row.species}</strong> · {Number(row.quantityKg || 0).toLocaleString("fi-FI")} kg · Keskihinta: ALV 0 % {formatCompactMoney(row.averageUnitPriceEur || 0)}/kg · ALV {formatVatPercent()} % {formatCompactMoney(calculateGrossPrice(row.averageUnitPriceEur || 0) || 0)}/kg
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const filteredEntries = entries.filter((entry) => isWithinReportRange(entry.date));
  const freeCatchReportHeader = ["Pvm", "Kalalaji", "Määrä", "Pyyntiväline"];
  const freeCatchReportBody = filteredEntries.map((entry) => {
    const normalized = normalizeFishSpeciesLabel(entry.species);
    const speciesLabel = fishSpeciesByName[normalized]?.name_fi || String(entry.species || "").split(",")[0].trim() || "Muu";
    const kilos = Number(entry.kilos || 0);
    const count = Number(entry.count || 0);
    const quantityLabel = isCrayfishSpecies(speciesLabel)
      ? `${count.toLocaleString("fi-FI")} kpl${kilos > 0 ? ` (${kilos.toLocaleString("fi-FI")} kg)` : ""}`
      : `${kilos.toLocaleString("fi-FI")} kg${count > 0 ? ` (${count.toLocaleString("fi-FI")} kpl)` : ""}`;

    return [
      entry.date || "",
      speciesLabel,
      quantityLabel,
      formatCatchGearDisplay(entry),
    ];
  });
  const freeCatchReportRows = [freeCatchReportHeader, ...freeCatchReportBody];

  if (profile?.role === "member" && !hasFisherPremium) {
    return (
      <div style={styles.stack}>
        <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
          <div style={styles.rowBetween}>
            <strong>Raportit</strong>
            <div style={styles.muted}>Valittu aikaväli: {reportDateLabel}</div>
          </div>
          <div style={styles.grid2}>
            <div style={styles.field}>
              <label>Alkupäivä</label>
              <input
                style={styles.input}
                type="date"
                value={reportStartDate}
                onChange={(e) => setReportStartDate(e.target.value)}
                max={reportEndDate || undefined}
              />
            </div>
            <div style={styles.field}>
              <label>Loppupäivä</label>
              <input
                style={styles.input}
                type="date"
                value={reportEndDate}
                onChange={(e) => setReportEndDate(e.target.value)}
                min={reportStartDate || undefined}
              />
            </div>
          </div>
          <div style={styles.noticeInfo}>
            Ilmaisversiossa voit katsella ja ladata Exceliin perusraportin, jossa näkyvät päivämäärä, kalalaji, määrä ja pyyntiväline.
          </div>
          <div style={styles.row}>
            <button
              style={{ ...styles.button, ...styles.primaryButton }}
              onClick={() => { void exportSpreadsheet(`perusraportti-${reportStartDate || "alku"}-${reportEndDate || today()}.xlsx`, freeCatchReportRows, "Perusraportti"); }}
              disabled={freeCatchReportBody.length === 0}
            >
              Lataa perusraportti Exceliin
            </button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead>
                <tr>
                  {freeCatchReportHeader.map((label) => (
                    <th
                      key={label}
                      style={{
                        textAlign: "left",
                        padding: "12px 10px",
                        fontSize: 13,
                        fontWeight: 700,
                        color: "#0f172a",
                        borderBottom: "1px solid #cbd5e1",
                        background: "#eff6ff",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {freeCatchReportBody.length === 0 ? (
                  <tr>
                    <td colSpan={freeCatchReportHeader.length} style={{ padding: "16px 10px", color: "#64748b" }}>
                      Ei vielä tallennettuja saaliita valitulla aikavälillä.
                    </td>
                  </tr>
                ) : freeCatchReportBody.map((row, index) => (
                  <tr key={`${row[0]}-${row[1]}-${index}`}>
                    {row.map((cell, cellIndex) => (
                      <td
                        key={`${row[0]}-${row[1]}-${cellIndex}`}
                        style={{
                          padding: "12px 10px",
                          borderBottom: "1px solid #e2e8f0",
                          verticalAlign: "top",
                          color: "#0f172a",
                        }}
                      >
                        {cell || "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={styles.noticeWarning}>
            {buildFisherPremiumMessage("Virallinen saalisraportti ja raporttivienti")}
          </div>
          <div style={styles.muted}>
            Virallinen saalisilmoitus, jäljitettävyys ja muut laajemmat raportit avautuvat, kun ylläpitäjä aktivoi kalastajalisenssin.
          </div>
        </div>
      </div>
    );
  }
  const filteredProcessedEntries = processedEntries.filter((entry) => isWithinReportRange(entry.productionDate));
  const filteredOffers = offers.filter((offer) => isWithinReportRange(offer.created_at));

  const catchSpeciesColumns = Array.from(new Set(
    filteredEntries
      .map((entry) => {
        const normalized = normalizeFishSpeciesLabel(entry.species);
        return fishSpeciesByName[normalized]?.name_fi || String(entry.species || "").split(",")[0].trim();
      })
      .filter(Boolean),
  )).sort((a, b) => {
    const orderA = fishSpeciesCatalog.findIndex((item) => item.name_fi === a);
    const orderB = fishSpeciesCatalog.findIndex((item) => item.name_fi === b);
    if (orderA === -1 && orderB === -1) return a.localeCompare(b, "fi");
    if (orderA === -1) return 1;
    if (orderB === -1) return -1;
    return orderA - orderB;
  });

  const catchSessions = Object.values(filteredEntries.reduce((acc, entry) => {
    const vesselLabel = String(entry.commercialFishingVesselId || "").trim()
      || (String(entry.commercialFishingId || "").trim() ? "Kalastus ilman alusta" : "");
    const sessionKey = [
      entry.date || "",
      vesselLabel,
      entry.area || "",
      entry.municipality || "",
      entry.landingPlace || "",
      formatCatchGearDisplay(entry),
      entry.gearCount || "",
      entry.fishingDurationDays || "",
      entry.ownerUserId || "",
      entry.spot || "",
    ].join("|");
    const normalized = normalizeFishSpeciesLabel(entry.species);
    const speciesLabel = fishSpeciesByName[normalized]?.name_fi || String(entry.species || "").split(",")[0].trim() || "Muu";
    const kilos = Number(entry.kilos || 0);

    if (!acc[sessionKey]) {
      acc[sessionKey] = {
        id: sessionKey,
        date: entry.date || "",
        vesselLabel,
        fishingAreaLabel: [entry.area, entry.municipality].filter(Boolean).join(", "),
        landingPlace: entry.landingPlace || "",
        gearLabel: formatCatchGearDisplay(entry),
        gearCount: entry.gearCount || "",
        fishingDurationDays: entry.fishingDurationDays || "",
        speciesTotals: {},
        batchIds: [],
      };
    }

    acc[sessionKey].speciesTotals[speciesLabel] = Number(acc[sessionKey].speciesTotals[speciesLabel] || 0) + kilos;
    if (entry.batchId) acc[sessionKey].batchIds.push(entry.batchId);
    return acc;
  }, {})).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

  const formatReportMetric = (value) => {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) return "0";
    if (Number.isInteger(amount)) return String(amount);
    return amount.toFixed(1).replace(".", ",");
  };

  const catchReportHeader = [
    "Kalastuspvm",
    "Alus",
    "Kalastamisalue",
    "Purkamispaikka",
    "Pyydys",
    "Pyydysten määrä",
    "Pyyntiaika",
    ...catchSpeciesColumns.map((species) => `${species} kg`),
    "Jäljitettävyys",
  ];

  const reportRows = catchSessions.map((session) => [
    session.date,
    session.vesselLabel,
    session.fishingAreaLabel,
    session.landingPlace,
    session.gearLabel,
    session.gearCount,
    session.fishingDurationDays,
    ...catchSpeciesColumns.map((species) => formatReportMetric(session.speciesTotals[species] || 0)),
    Array.from(new Set(session.batchIds)).join(", "),
  ]);

  const offerRows = filteredOffers.map((offer) => [
    offer.created_at || "",
    offer.company_name,
    offer.contact_name,
    offer.contact_email,
    offer.contact_phone,
    offer.offer_price_per_kg,
    offer.status,
    offer.message,
  ]);

  const processedRows = filteredProcessedEntries.map((entry) => [
    entry.productionDate,
    entry.ownerName,
    entry.area,
    entry.municipality || "",
    entry.productName,
    entry.productType,
    entry.processingMethod,
    entry.speciesSummary,
    entry.kilos,
    entry.packageSizeG,
    entry.packageCount,
    entry.bestBeforeDate,
    entry.deliveryMethod,
    entry.deliveryArea,
    entry.deliveryCost,
    entry.earliestDeliveryDate,
    entry.coldTransport ? "Kyllä" : "Ei",
    entry.notes,
  ]);

  const catchReportRows = [catchReportHeader, ...reportRows];
  const officialCatchWorkbook = buildOfficialCatchWorkbook(filteredEntries, reportDateLabel, profile);
  const officialCatchIssues = validateOfficialCatchEntries(filteredEntries);
  const offerReportRows = [["Pvm", "Yritys", "Yhteyshenkilö", "Sähköposti", "Puhelin", "Tarjous €/kg", "Tila", "Viesti"], ...offerRows];
  const processedReportRows = [["Tuotantopäivä", "Kirjaaja", "Vesialue", "Paikkakunta", "Tuotenimi", "Tuotetyyppi", "Käsittely", "Lajiyhteenveto", "Kg", "Pakkauskoko g", "Pakkausten määrä", "Parasta ennen", "Toimitustapa", "Toimitusalue", "Toimituskustannus €", "Aikaisin toimitus", "Kylmäkuljetus", "Lisätiedot"], ...processedRows];

  return (
    <div style={styles.stack}>
      <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
        <strong>Excel-raportit</strong>
        <div style={styles.noticeInfo}>Valitse raportille aikaväli. Voit ladata Excelin tai lähettää sen sähköpostiin liitetiedostona.</div>
        <div style={styles.grid2}>
          <div style={styles.field}>
            <label>Alkupäivä</label>
            <input
              style={styles.input}
              type="date"
              value={reportStartDate}
              onChange={(e) => setReportStartDate(e.target.value)}
              max={reportEndDate || undefined}
            />
          </div>
          <div style={styles.field}>
            <label>Loppupäivä</label>
            <input
              style={styles.input}
              type="date"
              value={reportEndDate}
              onChange={(e) => setReportEndDate(e.target.value)}
              min={reportStartDate || undefined}
            />
          </div>
        </div>
        <div style={styles.field}>
          <label>Sähköposti raportin lähetykseen</label>
          <input
            style={styles.input}
            type="email"
            value={reportEmail}
            onChange={(e) => setReportEmail(e.target.value)}
            placeholder="esim. raportit@yritys.fi"
          />
        </div>
        <div style={styles.muted}>Valittu aikaväli: {reportDateLabel}</div>
        <div style={styles.row}>
          <button
            style={{ ...styles.button, ...styles.primaryButton }}
            onClick={() => { void exportSpreadsheet(`saaliit-${reportStartDate || "alku"}-${reportEndDate || today()}.xlsx`, catchReportRows, "Saalisraportti"); }}
          >
            Lataa saalisraportti Exceliin
          </button>
          <button
            style={styles.button}
            onClick={() => {
              const filename = `saaliit-${reportStartDate || "alku"}-${reportEndDate || today()}.xlsx`;
              setReportSendingKey("catch");
              void sendReportEmail({
                filename,
                rows: catchReportRows,
                sheetName: "Saalisraportti",
                reportLabel: "Saalisraportti",
              })
                .then(() => setAuthInfo(`Saalisraportti lähetetty osoitteeseen ${normalizeEmail(reportEmail)}.`))
                .catch((error) => setAuthError(String(error?.message || error)))
                .finally(() => setReportSendingKey(""));
            }}
            disabled={reportSendingKey === "catch"}
          >
            {reportSendingKey === "catch" ? "Lähetetään..." : "Lähetä saalisraportti sähköpostiin"}
          </button>
        </div>
        <div style={{ ...styles.noticeInfo, whiteSpace: "pre-line" }}>
          Virallinen saalisilmoitus käyttää erillistä raporttia, jossa tiedot esitetään kalastamisalueen numerolla, pyydyskoodilla ja purkamispaikan numerolla täyttöohjeen mukaisesti.
          {"\n"}Kilot pyöristetään siinä täysiin kiloihin virallisen ilmoituksen vuoksi, mutta appin oma kaupallinen data säilyy ennallaan.
        </div>
        {officialCatchIssues.length > 0 ? (
          <div style={{ ...styles.noticeError, whiteSpace: "pre-line" }}>
            Virallista saalisilmoitusta ei voi muodostaa ennen kuin puuttuvat tiedot on täydennetty.
            {"\n"}Puuttuvia tietoja löytyi {officialCatchIssues.length} saaliserältä.
            {"\n"}{officialCatchIssues.slice(0, 5).map((issue) => `- ${issue}`).join("\n")}
            {officialCatchIssues.length > 5 ? `\n- ...ja ${officialCatchIssues.length - 5} muuta puutetta` : ""}
          </div>
        ) : null}
        <div style={styles.row}>
          <button
            style={{ ...styles.button, ...styles.primaryButton }}
            onClick={() => {
              if (officialCatchIssues.length > 0) {
                setAuthError("Virallista saalisilmoitusta ei voi ladata ennen kuin puuttuvat tiedot on täydennetty.");
                return;
              }
              void exportSpreadsheet(`virallinen-saalisilmoitus-${reportStartDate || "alku"}-${reportEndDate || today()}.xlsx`, officialCatchWorkbook, "Virallinen saalisilmoitus");
            }}
            disabled={officialCatchIssues.length > 0}
          >
            Lataa virallinen saalisilmoitus Exceliin
          </button>
          <button
            style={styles.button}
            onClick={() => {
              if (officialCatchIssues.length > 0) {
                setAuthError("Virallista saalisilmoitusta ei voi lähettää ennen kuin puuttuvat tiedot on täydennetty.");
                return;
              }
              const filename = `virallinen-saalisilmoitus-${reportStartDate || "alku"}-${reportEndDate || today()}.xlsx`;
              setReportSendingKey("official_catch");
              void sendReportEmail({
                filename,
                rows: officialCatchWorkbook,
                sheetName: "Virallinen saalisilmoitus",
                reportLabel: "Virallinen saalisilmoitus",
              })
                .then(() => setAuthInfo(`Virallinen saalisilmoitus lähetetty osoitteeseen ${normalizeEmail(reportEmail)}.`))
                .catch((error) => setAuthError(String(error?.message || error)))
                .finally(() => setReportSendingKey(""));
            }}
            disabled={reportSendingKey === "official_catch" || officialCatchIssues.length > 0}
          >
            {reportSendingKey === "official_catch" ? "Lähetetään..." : "Lähetä virallinen saalisilmoitus sähköpostiin"}
          </button>
        </div>
        <div style={styles.row}>
          <button
            style={styles.button}
            onClick={() => { void exportSpreadsheet(`tarjoukset-${reportStartDate || "alku"}-${reportEndDate || today()}.xlsx`, offerReportRows, "Tarjoukset"); }}
          >
            Lataa tarjousraportti Exceliin
          </button>
          <button
            style={styles.button}
            onClick={() => {
              const filename = `tarjoukset-${reportStartDate || "alku"}-${reportEndDate || today()}.xlsx`;
              setReportSendingKey("offers");
              void sendReportEmail({
                filename,
                rows: offerReportRows,
                sheetName: "Tarjoukset",
                reportLabel: "Tarjousraportti",
              })
                .then(() => setAuthInfo(`Tarjousraportti lähetetty osoitteeseen ${normalizeEmail(reportEmail)}.`))
                .catch((error) => setAuthError(String(error?.message || error)))
                .finally(() => setReportSendingKey(""));
            }}
            disabled={reportSendingKey === "offers"}
          >
            {reportSendingKey === "offers" ? "Lähetetään..." : "Lähetä tarjousraportti sähköpostiin"}
          </button>
        </div>
        <div style={styles.row}>
          <button
            style={styles.button}
            onClick={() => { void exportSpreadsheet(`jaloste-erat-${reportStartDate || "alku"}-${reportEndDate || today()}.xlsx`, processedReportRows, "Jaloste-erat"); }}
          >
            Lataa jaloste-erät Exceliin
          </button>
          <button
            style={styles.button}
            onClick={() => {
              const filename = `jaloste-erat-${reportStartDate || "alku"}-${reportEndDate || today()}.xlsx`;
              setReportSendingKey("processed");
              void sendReportEmail({
                filename,
                rows: processedReportRows,
                sheetName: "Jaloste-erat",
                reportLabel: "Jaloste-eräraportti",
              })
                .then(() => setAuthInfo(`Jaloste-eräraportti lähetetty osoitteeseen ${normalizeEmail(reportEmail)}.`))
                .catch((error) => setAuthError(String(error?.message || error)))
                .finally(() => setReportSendingKey(""));
            }}
            disabled={reportSendingKey === "processed"}
          >
            {reportSendingKey === "processed" ? "Lähetetään..." : "Lähetä jaloste-erät sähköpostiin"}
          </button>
        </div>
      </div>

      <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
        <div style={styles.rowBetween}>
          <strong>Saalisraportti</strong>
          <div style={styles.muted}>Yksi rivi per saaliskerta. Puuttuvat kalalajit näytetään nollina.</div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1040 }}>
            <thead>
              <tr>
                {catchReportHeader.map((label) => (
                  <th
                    key={label}
                    style={{
                      textAlign: "left",
                      padding: "12px 10px",
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#0f172a",
                      borderBottom: "1px solid #cbd5e1",
                      background: "#eff6ff",
                      whiteSpace: "nowrap",
                      position: "sticky",
                      top: 0,
                    }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {catchSessions.length === 0 ? (
                <tr>
                  <td colSpan={catchReportHeader.length} style={{ padding: "16px 10px", color: "#64748b" }}>
                    Ei vielä tallennettuja saaliskertoja raportille.
                  </td>
                </tr>
              ) : catchSessions.map((session) => (
                <tr key={session.id}>
                  <td style={{ padding: "12px 10px", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{session.date || "-"}</td>
                  <td style={{ padding: "12px 10px", borderBottom: "1px solid #e2e8f0" }}>{session.vesselLabel || "-"}</td>
                  <td style={{ padding: "12px 10px", borderBottom: "1px solid #e2e8f0" }}>{session.fishingAreaLabel || "-"}</td>
                  <td style={{ padding: "12px 10px", borderBottom: "1px solid #e2e8f0" }}>{session.landingPlace || "-"}</td>
                  <td style={{ padding: "12px 10px", borderBottom: "1px solid #e2e8f0" }}>{session.gearLabel || "-"}</td>
                  <td style={{ padding: "12px 10px", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{session.gearCount || "0"}</td>
                  <td style={{ padding: "12px 10px", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{session.fishingDurationDays || "-"}</td>
                  {catchSpeciesColumns.map((species) => (
                    <td key={`${session.id}-${species}`} style={{ padding: "12px 10px", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>
                      {formatReportMetric(session.speciesTotals[species] || 0)}
                    </td>
                  ))}
                  <td style={{ padding: "12px 10px", borderBottom: "1px solid #e2e8f0", minWidth: 180 }}>
                    {Array.from(new Set(session.batchIds)).join(", ") || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function BillingView({ buyerOffers, buyerStatusLabel, shouldRevealBuyerIdentity, billingFilter, setBillingFilter, onUpdateBillingStatus }) {
  const acceptedOffers = (buyerOffers || []).filter((offer) => {
    if (offer.status !== "accepted") return false;
    if (billingFilter === "all") return true;
    return getOwnerCommissionStatus(offer) === billingFilter;
  });

  const normalizedAcceptedOffers = acceptedOffers.map((offer) => {
    const monthKey = String(
      offer.owner_commission_month ||
      offer.billing_month ||
      (() => {
        try {
          const d = new Date(offer.updated_at || offer.created_at || new Date().toISOString());
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        } catch {
          return "Ei kuukautta";
        }
      })()
    ).trim() || "Ei kuukautta";

    const buyerLabel = shouldRevealBuyerIdentity(offer.status)
      ? (offer.buyer_company_name || offer.buyer_email || "Ostaja")
      : "Anonyymi ostaja";
    const kilos = Number(offer.reserved_kilos || offer.total_kilos || 0);
    const pricePerKg = Number(offer.counter_price_per_kg || offer.price_per_kg || 0);
    const calculatedTradeValue = Number.isFinite(Number(offer.tradeValue))
      ? Number(offer.tradeValue)
      : kilos * pricePerKg;
    const calculatedCommissionValue = Number.isFinite(Number(offer.commissionValue))
      ? Number(offer.commissionValue)
      : calculatedTradeValue * COMMISSION_RATE;

    return {
      ...offer,
      ownerCommissionMonthKey: monthKey,
      buyerLabel,
      billingKilos: kilos,
      billingPricePerKg: pricePerKg,
      tradeValue: resolveOwnerCommissionNumber(offer.owner_trade_value, calculatedTradeValue),
      commissionValue: resolveOwnerCommissionNumber(offer.owner_commission_amount, calculatedCommissionValue),
    };
  });

  const availableMonths = Array.from(new Set(normalizedAcceptedOffers.map((offer) => offer.ownerCommissionMonthKey)))
    .sort((a, b) => b.localeCompare(a, "fi"));
  const [billingMonthFilter, setBillingMonthFilter] = useState("latest");
  const [expandedBillingGroupKey, setExpandedBillingGroupKey] = useState("");

  useEffect(() => {
    if (availableMonths.length === 0) {
      if (billingMonthFilter !== "latest") setBillingMonthFilter("latest");
      return;
    }
    if (billingMonthFilter === "latest") return;
    if (!availableMonths.includes(billingMonthFilter)) {
      setBillingMonthFilter("latest");
    }
  }, [availableMonths, billingMonthFilter]);

  const activeMonthKey = billingMonthFilter === "latest"
    ? (availableMonths[0] || "all")
    : billingMonthFilter;
  const monthScopedOffers = activeMonthKey === "all"
    ? normalizedAcceptedOffers
    : normalizedAcceptedOffers.filter((offer) => offer.ownerCommissionMonthKey === activeMonthKey);

  const grouped = monthScopedOffers.reduce((acc, offer) => {
    const sellerKey = offer.seller_user_id || offer.seller_name || "Tuntematon myyjä";
    const sellerLabel = offer.seller_name || "Tuntematon myyjä";
    const groupKey = `${offer.ownerCommissionMonthKey}__${sellerKey}`;

    if (!acc[groupKey]) {
      acc[groupKey] = {
        monthKey: offer.ownerCommissionMonthKey,
        sellerKey,
        sellerLabel,
        offers: [],
        totalKilos: 0,
        totalTradeValue: 0,
        totalCommissionValue: 0,
      };
    }

    acc[groupKey].offers.push(offer);
    acc[groupKey].totalKilos += offer.billingKilos;
    acc[groupKey].totalTradeValue += offer.tradeValue;
    acc[groupKey].totalCommissionValue += offer.commissionValue;
    return acc;
  }, {});

  const groups = Object.values(grouped).sort((a, b) => a.sellerLabel.localeCompare(b.sellerLabel, "fi"));

  useEffect(() => {
    if (groups.length === 0) {
      if (expandedBillingGroupKey) setExpandedBillingGroupKey("");
      return;
    }
    const hasExpandedGroup = groups.some((group) => `${group.monthKey}-${group.sellerKey}` === expandedBillingGroupKey);
    if (!hasExpandedGroup) {
      setExpandedBillingGroupKey(`${groups[0].monthKey}-${groups[0].sellerKey}`);
    }
  }, [groups, expandedBillingGroupKey]);

  const monthSummary = monthScopedOffers.reduce((acc, offer) => {
    acc.totalKilos += offer.billingKilos;
    acc.totalTradeValue += offer.tradeValue;
    acc.totalCommissionValue += offer.commissionValue;
    acc.totalTrades += 1;
    return acc;
  }, {
    totalKilos: 0,
    totalTradeValue: 0,
    totalCommissionValue: 0,
    totalTrades: 0,
  });

  const exportBillingCsv = (group) => {
    void exportSpreadsheet(
      `laskutus-${group.monthKey}-${group.sellerLabel.replace(/[^a-z0-9åäö_-]+/gi, "-")}.xlsx`,
      [
        ["Kuukausi", "Myyjä", "Ostaja", "Erä", "Kg", "Hinta €/kg", "Kaupan arvo €", "Komissio %", "Komissio €", "Päivä", "Tila"],
        ...group.offers.map((offer) => [
          group.monthKey,
          group.sellerLabel,
          offer.buyerLabel,
          String(offer.species_summary || "").split("\n").join(" | "),
          offer.billingKilos,
          offer.billingPricePerKg,
          offer.tradeValue.toFixed(2),
          `${(COMMISSION_RATE * 100).toFixed(1)} %`,
          offer.commissionValue.toFixed(2),
          offer.updated_at || offer.created_at || "",
          buyerStatusLabel(offer.status),
        ]),
      ],
      "Laskutus"
    );
  };

  return (
    <div style={styles.stack}>
      <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
        <div style={styles.rowBetween}>
          <strong>Laskutus</strong>
          <div style={{ ...styles.row, gap: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <select style={{ ...styles.input, minWidth: 190 }} value={billingMonthFilter} onChange={(e) => setBillingMonthFilter(e.target.value)}>
              <option value="latest">Uusin kuukausi</option>
              {availableMonths.length > 1 ? <option value="all">Kaikki kuukaudet</option> : null}
              {availableMonths.map((month) => (
                <option key={month} value={month}>{month}</option>
              ))}
            </select>
            <select style={{ ...styles.input, minWidth: 190 }} value={billingFilter} onChange={(e) => setBillingFilter(e.target.value)}>
              <option value="unbilled">Laskuttamattomat</option>
              <option value="invoiced">Laskutetut</option>
              <option value="paid">Maksetut</option>
              <option value="all">Kaikki</option>
            </select>
          </div>
        </div>
        <div style={styles.noticeInfo}>Käsittele ylläpitäjän komissiolaskutus yksi kuukausi kerrallaan. Komissio lasketaan oletuksella {(COMMISSION_RATE * 100).toFixed(1)} % kaupan arvosta.</div>
        <div style={styles.entryBadges}>
          <span style={styles.badge}>{activeMonthKey === "all" ? "Kaikki kuukaudet" : activeMonthKey === "Ei kuukautta" ? "Ei kuukautta" : `Kuukausi ${activeMonthKey}`}</span>
          <span style={styles.badge}>{groups.length} kalastajaa</span>
          <span style={styles.badge}>{monthSummary.totalTrades} kauppaa</span>
          <span style={styles.badge}>{monthSummary.totalKilos.toFixed(1)} kg</span>
          <span style={styles.badge}>{euro(monthSummary.totalTradeValue)} kaupan arvo</span>
          <span style={{ ...styles.badge, background: "#ecfdf5", borderColor: "#86efac" }}>{euro(monthSummary.totalCommissionValue)} komissio</span>
        </div>
      </div>

      {groups.length === 0 ? (
        <div style={{ ...styles.card, ...styles.sectionCard }}>
          <div style={styles.muted}>Ei vielä hyväksyttyjä kauppoja valitulla kuukaudella.</div>
        </div>
      ) : (
        groups.map((group) => (
          <div key={`${group.monthKey}-${group.sellerKey}`} style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
            <div style={styles.rowBetween}>
              <div>
                <strong>{group.sellerLabel}</strong>
                {(() => {
                  const sellerOffer = group.offers[0] || {};
                  const sellerBillingAddress = formatInvoicePartyAddress(
                    sellerOffer.seller_address,
                    sellerOffer.seller_postcode,
                    sellerOffer.seller_city,
                  );
                  const sellerBillingParts = [
                    sellerOffer.seller_business_id ? `Y-tunnus ${sellerOffer.seller_business_id}` : "",
                    sellerOffer.seller_billing_email || sellerOffer.seller_email || "",
                    sellerBillingAddress,
                  ].filter(Boolean);

                  return sellerBillingParts.length > 0
                    ? <div style={styles.muted}>{sellerBillingParts.join(" · ")}</div>
                    : null;
                })()}
                <div style={styles.muted}>Kuukausi: {group.monthKey}</div>
              </div>
              <div style={{ ...styles.row, gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button
                  style={styles.button}
                  onClick={() => setExpandedBillingGroupKey((prev) => prev === `${group.monthKey}-${group.sellerKey}` ? "" : `${group.monthKey}-${group.sellerKey}`)}
                >
                  {expandedBillingGroupKey === `${group.monthKey}-${group.sellerKey}` ? "Piilota kaupat" : "Avaa kaupat"}
                </button>
                <button style={styles.button} onClick={() => exportBillingCsv(group)}>Vie laskutus CSV</button>
              </div>
            </div>

            <div style={styles.entryBadges}>
              <span style={styles.badge}>{group.totalKilos.toFixed(1)} kg</span>
              <span style={styles.badge}>{euro(group.totalTradeValue)} kaupan arvo</span>
              <span style={styles.badge}>{euro(group.totalCommissionValue)} komissio</span>
              <span style={styles.badge}>{group.offers.length} kauppaa</span>
            </div>

            {expandedBillingGroupKey === `${group.monthKey}-${group.sellerKey}` ? group.offers.map((offer) => (
              <div key={offer.id} style={styles.entry}>
                <div style={styles.entryBadges}>
                  <span style={styles.badge}>{offer.buyerLabel}</span>
                  <span style={styles.badge}>{offer.billingKilos} kg</span>
                <span style={styles.badge}>{euro(offer.billingPricePerKg)} / kg ALV 0 %</span>
                <span style={styles.badge}>{euro(calculateGrossPrice(offer.billingPricePerKg) || 0)} / kg sis. ALV {formatVatPercent()} %</span>
                  <span style={styles.badge}>{euro(offer.tradeValue)}</span>
                  <span style={{ ...styles.badge, background: "#ecfdf5", borderColor: "#86efac" }}>{euro(offer.commissionValue)} komissio</span>
                </div>
                <div style={{ ...styles.muted, whiteSpace: "pre-wrap" }}><strong>Erä:</strong> {formatSpeciesSummaryText(offer.species_summary) || "-"}</div>
                {getOfferSummaryCatchDates(offer.species_summary).length > 0 ? <div style={styles.muted}><strong>Pyyntipäivämäärä:</strong> {getOfferSummaryCatchDates(offer.species_summary).join(", ")}</div> : null}
                <div style={styles.muted}><strong>Päivä:</strong> {offer.updated_at || offer.created_at || "-"}</div>
                <div style={styles.muted}><strong>Komission tila:</strong> {getOwnerCommissionStatusLabel(offer)}</div>
                {offer.buyer_message ? <div style={styles.muted}><strong>Viesti:</strong> {offer.buyer_message}</div> : null}
                <div style={{ ...styles.row, marginTop: 10 }}>
                  {getOwnerCommissionStatus(offer) !== "invoiced" ? <button style={styles.button} onClick={() => onUpdateBillingStatus(offer, "invoiced")}>Merkitse komissio laskutetuksi</button> : null}
                  {getOwnerCommissionStatus(offer) !== "paid" ? <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => onUpdateBillingStatus(offer, "paid")}>Merkitse komissio maksetuksi</button> : null}
                  {getOwnerCommissionStatus(offer) !== "unbilled" ? <button style={styles.button} onClick={() => onUpdateBillingStatus(offer, "unbilled")}>Palauta komissio laskuttamattomaksi</button> : null}
                </div>
              </div>
            )) : (
              <div style={styles.muted}>Avaa kalastajan kaupat nähdäksesi yksittäiset laskutusrivit.</div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function calculateSellerInvoiceDetails(offer) {
  const vatRate = 0.135;
  const kilos = Number(offer?.reserved_kilos || offer?.total_kilos || 0);
  const unitPrice = Number(offer?.counter_price_per_kg || offer?.price_per_kg || 0);
  const productTotalFromLineItems = parseSellerInvoiceLineItems(offer).reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
  const productTotalFromSummary = parseTradeValueFromSpeciesSummary(offer?.species_summary);
  const productTotal = productTotalFromLineItems > 0 ? productTotalFromLineItems : productTotalFromSummary;
  const deliveryCost = Number(offer?.delivery_cost ?? offer?.route_price_eur ?? 0) || 0;
  const productVatAmount = productTotal * vatRate;
  const deliveryVatAmount = deliveryCost * vatRate;
  const netTotal = productTotal + deliveryCost;
  const vatAmount = productVatAmount + deliveryVatAmount;
  const grandTotal = netTotal + vatAmount;

  return {
    vatRate,
    kilos,
    unitPrice,
    productTotal,
    productVatAmount,
    deliveryCost,
    deliveryVatAmount,
    netTotal,
    vatAmount,
    grandTotal,
  };
}

function formatInvoicePartyAddress(address, postcode, city) {
  return [
    String(address || "").trim(),
    [String(postcode || "").trim(), String(city || "").trim()].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ");
}

function formatInvoiceDeliveryDate(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value || "").trim();
  return parsed.toLocaleDateString("fi-FI", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function calculateFinnishReferenceCheckDigit(baseDigits) {
  const weights = [7, 3, 1];
  const sum = String(baseDigits || "")
    .split("")
    .reverse()
    .reduce((total, digit, index) => total + (Number(digit || 0) * weights[index % weights.length]), 0);
  return (10 - (sum % 10)) % 10;
}

function formatFinnishReferenceDisplay(referenceNumber) {
  const digits = String(referenceNumber || "").replace(/\D/g, "").replace(/^0+/, "") || "0";
  return digits
    .replace(/(.)(?=(.{5})+$)/g, "$1 ")
    .trim();
}

function buildSellerInvoiceReference(offer) {
  const idDigits = String(offer?.id || "").replace(/\D/g, "");
  const dateDigits = String(offer?.updated_at || offer?.created_at || today()).replace(/\D/g, "");
  let baseDigits = `${dateDigits}${idDigits}`.replace(/^0+/, "").slice(-18);
  if (!baseDigits) baseDigits = "100";
  if (baseDigits.length < 3) baseDigits = baseDigits.padEnd(3, "0");
  return `${baseDigits}${calculateFinnishReferenceCheckDigit(baseDigits)}`;
}

function buildSellerInvoiceNumber(offer) {
  const datePart = String(offer?.updated_at || offer?.created_at || today()).slice(0, 10).replace(/\D/g, "") || today().replace(/\D/g, "");
  const idPart = String(offer?.id || "").replace(/[^a-zA-Z0-9]+/g, "").slice(0, 6).toUpperCase() || "000001";
  return `LASKU-${datePart}-${idPart}`;
}

function buildSellerInvoiceDueDate(offer) {
  const dateValue = new Date(offer?.updated_at || offer?.created_at || new Date().toISOString());
  if (Number.isNaN(dateValue.getTime())) return today();
  dateValue.setDate(dateValue.getDate() + 14);
  return dateValue.toISOString().slice(0, 10);
}

function parseAcceptedSpeciesPricesFromMessage(message) {
  return String(message || "")
    .split("\n")
    .map((line) => line.trim())
    .reduce((acc, line) => {
      const match = line.match(/^- (.+?):\s*([0-9]+(?:[.,][0-9]+)?)\s*€\/(kg|kpl)$/i);
      if (!match) return acc;
      const label = String(match[1] || "").trim();
      const price = parseLocaleNumber(match[2]);
      if (!label || price == null) return acc;
      acc[label] = { price: Number(price), unit: String(match[3] || "").trim().toLowerCase() };
      return acc;
    }, {});
}

function parseSellerInvoiceLineItems(offer) {
  const lines = getOfferSummaryLines(offer?.species_summary);
  const fallbackQuantity = getOfferQuantityDisplay(offer);
  const fallbackUnit = getOfferDisplayUnit(offer);
  const fallbackPrice = Number(offer?.counter_price_per_kg || offer?.price_per_kg || 0);
  const mixedOffer = isMixedOffer(offer);
  const acceptedSpeciesPrices = parseAcceptedSpeciesPricesFromMessage(offer?.buyer_message);
  const reservedKilos = Number(offer?.reserved_kilos || 0);

  const parsedLines = lines.map((line) => {
    const visibleLine = stripOfferInlineMetaText(line, {
      hideTraceability: true,
      hidePrice: true,
      hideCatchDate: true,
    });
    const description = formatSpeciesForSale((visibleLine.split(":")[0] || visibleLine || "Kalaerä").trim());
    const priceMatch = String(line || "").match(/Hinta(?:\s+ALV\s+0\s*%)?\s+([0-9]+(?:[.,][0-9]+)?)/i);
    const pieceMatch = String(visibleLine || "").match(/\(([0-9]+(?:[.,][0-9]+)?)\s*kpl\)/i);
    const kiloMatch = String(visibleLine || "").match(/:\s*([0-9]+(?:[.,][0-9]+)?)\s*kg/i);
    const isCrayfishLine = isCrayfishSpecies(description);
    const parsedSummaryQuantity = Number(parseLocaleNumber(isCrayfishLine ? pieceMatch?.[1] : kiloMatch?.[1]) || 0);
    const quantity = !mixedOffer && !isCrayfishLine && reservedKilos > 0 ? reservedKilos : parsedSummaryQuantity;
    const unit = isCrayfishLine ? "kpl" : "kg";
    const summaryUnitPrice = Number(parseLocaleNumber(priceMatch?.[1]) || 0);
    const acceptedPriceRow = acceptedSpeciesPrices[description] || null;
    const explicitCounterPrice = !mixedOffer && offer?.counter_price_per_kg !== "" && offer?.counter_price_per_kg != null
      ? Number(offer.counter_price_per_kg)
      : null;
    const unitPrice = Number(
      acceptedPriceRow?.price ??
      explicitCounterPrice ??
      (summaryUnitPrice > 0 ? summaryUnitPrice : null) ??
      (fallbackPrice > 0 ? fallbackPrice : null) ??
      0
    );

    return {
      description,
      quantity,
      quantityDisplay: quantity > 0 ? `${quantity.toLocaleString("fi-FI")} ${unit}` : fallbackQuantity,
      unit: acceptedPriceRow?.unit || unit,
      unitPrice,
      lineTotal: quantity * unitPrice,
    };
  }).filter((item) => item.description);

  if (parsedLines.length > 0) return parsedLines;

  const fallbackQuantityValue = Number(offer?.reserved_kilos || offer?.total_kilos || 0);
  return [{
    description: formatSpeciesSummaryText(offer?.species_summary) || "Kalaerä",
    quantity: fallbackQuantityValue,
    quantityDisplay: fallbackQuantity,
    unit: fallbackUnit,
    unitPrice: fallbackPrice,
    lineTotal: fallbackQuantityValue * fallbackPrice,
  }];
}

function normalizeFinnishIban(iban) {
  const cleaned = String(iban || "").replace(/\s+/g, "").toUpperCase();
  if (!/^FI\d{16}$/.test(cleaned)) return "";
  return cleaned;
}

function formatBankBarcodeDueDate(dueDate) {
  if (!dueDate) return "000000";
  const digits = String(dueDate || "").replace(/\D/g, "");
  if (digits.length === 8) return digits.slice(2);
  return "000000";
}

function formatBankBarcodeAmount(total) {
  const cents = Math.round(Number(total || 0) * 100);
  if (!Number.isFinite(cents) || cents < 0 || cents > 99999999) return "00000000";
  return String(cents).padStart(8, "0");
}

function buildSellerInvoiceBankBarcode(invoice) {
  const iban = normalizeFinnishIban(invoice?.sellerIban);
  const referenceDigits = String(invoice?.referenceNumber || "").replace(/\D/g, "");
  if (!iban || !referenceDigits) return "";

  const ibanNumericPart = iban.slice(2);
  const amountField = formatBankBarcodeAmount(invoice?.grandTotal);
  const referenceField = referenceDigits.padStart(20, "0").slice(-20);
  const dueDateField = formatBankBarcodeDueDate(invoice?.dueDate);
  return `4${ibanNumericPart}${amountField}000${referenceField}${dueDateField}`;
}

function drawCode128SetCBarcode(doc, data, x, y, width, height) {
  const code128Patterns = [
    "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
    "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
    "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
    "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
    "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
    "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
    "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
    "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
    "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
    "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
    "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
  ];
  const cleaned = String(data || "").replace(/\D/g, "");
  if (!cleaned || cleaned.length % 2 !== 0) return false;

  const values = [];
  for (let index = 0; index < cleaned.length; index += 2) {
    values.push(Number(cleaned.slice(index, index + 2)));
  }

  let checksum = 105;
  values.forEach((value, index) => {
    checksum += value * (index + 1);
  });
  checksum %= 103;

  const sequence = [105, ...values, checksum, 106];
  const totalModules = sequence.reduce((sum, value) => sum + code128Patterns[value].split("").reduce((patternSum, digit) => patternSum + Number(digit), 0), 0);
  const maxBarcodeWidth = Math.min(105, width);
  const barcodeWidth = Math.max(70, maxBarcodeWidth);
  const moduleWidth = barcodeWidth / totalModules;
  let cursorX = x + ((width - barcodeWidth) / 2);

  doc.setFillColor(15, 23, 42);
  sequence.forEach((value) => {
    const pattern = code128Patterns[value];
    pattern.split("").forEach((digit, patternIndex) => {
      const segmentWidth = Number(digit) * moduleWidth;
      if (patternIndex % 2 === 0) {
        doc.rect(cursorX, y, segmentWidth, height, "F");
      }
      cursorX += segmentWidth;
    });
  });

  return true;
}

function getSellerInvoicePayload(offer, sellerProfile) {
  const invoiceDetails = calculateSellerInvoiceDetails(offer);
  const referenceNumber = buildSellerInvoiceReference(offer);
  const lineItems = parseSellerInvoiceLineItems(offer).map((item) => {
    const lineTotal = Number(item.lineTotal || 0);
    const vatAmount = lineTotal * invoiceDetails.vatRate;
    const unitPrice = Number(item.unitPrice || 0);
    return {
      ...item,
      unitPrice,
      unitGrossPrice: unitPrice + (unitPrice * invoiceDetails.vatRate),
      lineTotal,
      vatAmount,
      grossTotal: lineTotal + vatAmount,
    };
  });
  return {
    invoiceNumber: buildSellerInvoiceNumber(offer),
    invoiceDate: today(),
    dueDate: buildSellerInvoiceDueDate(offer),
    referenceNumber,
    referenceDisplay: formatFinnishReferenceDisplay(referenceNumber),
    sellerName: String(sellerProfile?.company_name || sellerProfile?.display_name || sellerProfile?.email || "").trim() || "-",
    sellerBusinessId: String(sellerProfile?.business_id || "").trim(),
    sellerAddress: formatInvoicePartyAddress(sellerProfile?.address, sellerProfile?.postcode, sellerProfile?.city),
    sellerEmail: String(sellerProfile?.contact_email || sellerProfile?.email || "").trim(),
    sellerPhone: String(sellerProfile?.phone || "").trim(),
    sellerIban: String(sellerProfile?.bank_account_iban || "").trim(),
    sellerBic: String(sellerProfile?.bank_bic || "").trim(),
    buyerName: String(offer?.buyer_company_name || offer?.buyer_contact_name || offer?.buyer_email || "").trim() || "Asiakas",
    buyerBusinessId: String(offer?.buyer_business_id || "").trim(),
    buyerContactName: String(offer?.buyer_contact_name || "").trim(),
    buyerBillingEmail: String(offer?.buyer_billing_email || offer?.buyer_email || "").trim(),
    buyerPhone: String(offer?.buyer_phone || "").trim(),
    buyerBillingAddress: formatInvoicePartyAddress(offer?.buyer_billing_address, offer?.buyer_billing_postcode, offer?.buyer_billing_city),
    buyerDeliveryAddress: formatInvoicePartyAddress(offer?.buyer_delivery_address, offer?.buyer_delivery_postcode, offer?.buyer_delivery_city),
    deliveryDate: formatInvoiceDeliveryDate(offer?.updated_at || offer?.created_at),
    batchId: String(offer?.batch_id || "").trim(),
    catchDates: getOfferSummaryCatchDates(offer?.species_summary),
    areaText: [offer?.area, offer?.spot].map((item) => String(item || "").trim()).filter(Boolean).join(" / "),
    acceptedSourceLabel: getAcceptedInvoiceSourceLabel(offer),
    deliveryMethod: String(offer?.delivery_method || "").trim(),
    lineItems,
    vatRate: invoiceDetails.vatRate,
    productTotal: invoiceDetails.productTotal,
    productVatAmount: invoiceDetails.productVatAmount,
    deliveryCost: invoiceDetails.deliveryCost,
    deliveryVatAmount: invoiceDetails.deliveryVatAmount,
    netTotal: invoiceDetails.netTotal,
    vatAmount: invoiceDetails.vatAmount,
    grandTotal: invoiceDetails.grandTotal,
  };
}

async function buildSellerInvoicePdfDoc(offer, sellerProfile, options = {}) {
  const invoice = getSellerInvoicePayload(offer, sellerProfile);
  const documentKind = options.documentKind === "reminder" ? "reminder" : "invoice";
  const isReminder = documentKind === "reminder";
  const logoDataUrl = await fetchImageDataUrl(getAppLogoUrl()).catch(() => "");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const leftX = 16;
  const rightX = 194;
  const pageBottomY = 287;
  const lineHeight = 4.6;
  const tableBottomLimit = 207;
  const quantityX = 104;
  const unitPriceNetX = 124;
  const unitPriceGrossX = 144;
  const vatAmountX = 160;
  const totalNetX = 176;
  const totalGrossX = rightX - 2;
  const drawInvoiceTableHeader = (headerY) => {
    doc.setFillColor(15, 23, 42);
    doc.rect(leftX, headerY - 6, 178, 9, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.8);
    doc.setTextColor(255, 255, 255);
    doc.text("Tuote", leftX + 2, headerY);
    doc.text("Määrä", quantityX, headerY, { align: "right" });
    doc.text("Yks. ALV 0 %", unitPriceNetX, headerY, { align: "right" });
    doc.text("Yks. ALV 13,5 %", unitPriceGrossX, headerY, { align: "right" });
    doc.text("ALV", vatAmountX, headerY, { align: "right" });
    doc.text("Yht. ALV 0 %", totalNetX, headerY, { align: "right" });
    doc.text("Yht. ALV 13,5 %", totalGrossX, headerY, { align: "right" });
  };
  const renderInvoiceColumn = (lines, x, startY, maxWidth) => {
    let columnY = startY;
    lines.forEach((line) => {
      const wrappedLines = doc.splitTextToSize(String(line), maxWidth);
      doc.text(wrappedLines, x, columnY);
      columnY += Math.max(1, wrappedLines.length) * lineHeight;
    });
    return columnY;
  };
  let y = 18;

  doc.setFillColor(239, 246, 255);
  doc.rect(0, 0, 210, 44, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(isReminder ? 18 : 22);
  doc.setTextColor(15, 23, 42);
  doc.text(isReminder ? "MAKSUMUISTUTUS" : "LASKU", leftX, y + 2);
  doc.setFontSize(14);
  doc.setTextColor(30, 64, 175);
  doc.text("Suoraan Kalastajalta", leftX, y + 12);
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", leftX + 50, y + 0.8, 24, 15.2);
  }
  if (isReminder) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`Alkuperainen lasku: ${invoice.invoiceNumber}`, leftX, y + 19);
  }
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(invoice.invoiceNumber, rightX, y + 1, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.2);
  doc.text(`Laskun päiväys: ${invoice.invoiceDate}`, rightX, y + 8, { align: "right" });
  doc.text(`Eräpäivä: ${invoice.dueDate}`, rightX, y + 14, { align: "right" });

  y = 58;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Laskuttaja", leftX, y);
  doc.text("Laskutettava", 120, y);
  y += 6;

  const sellerLines = [
    invoice.sellerName,
    invoice.sellerBusinessId ? `Y-tunnus: ${invoice.sellerBusinessId}` : "",
    invoice.sellerAddress,
    invoice.sellerEmail,
    invoice.sellerPhone,
  ].filter(Boolean);
  const buyerLines = [
    invoice.buyerName,
    invoice.buyerBusinessId ? `Y-tunnus: ${invoice.buyerBusinessId}` : "",
    invoice.buyerContactName ? `Yhteyshenkilö: ${invoice.buyerContactName}` : "",
    invoice.buyerBillingAddress,
    invoice.buyerBillingEmail,
    invoice.buyerPhone,
    invoice.buyerDeliveryAddress ? `Toimitusosoite: ${invoice.buyerDeliveryAddress}` : "",
  ].filter(Boolean);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const sellerEndY = renderInvoiceColumn(sellerLines, leftX, y, 84);
  const buyerEndY = renderInvoiceColumn(buyerLines, 120, y, 70);

  y = Math.max(sellerEndY, buyerEndY) + 8;
  drawInvoiceTableHeader(y);

  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  invoice.lineItems.forEach((item) => {
    const itemLines = doc.splitTextToSize(item.description, 90);
    const rowHeight = Math.max(10, (itemLines.length * lineHeight) + 4);
    if (y + rowHeight > tableBottomLimit) {
      doc.addPage("a4", "portrait");
      y = 24;
      drawInvoiceTableHeader(y);
      y += 8;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.2);
      doc.setTextColor(15, 23, 42);
    }
    const textY = y + 3.5;
    doc.text(itemLines, leftX + 2, textY);
    doc.text(item.quantityDisplay || "-", quantityX, textY, { align: "right" });
    doc.text(item.unitPrice > 0 ? euro(item.unitPrice) : "-", unitPriceNetX, textY, { align: "right" });
    doc.text(item.unitGrossPrice > 0 ? euro(item.unitGrossPrice) : "-", unitPriceGrossX, textY, { align: "right" });
    doc.text(euro(item.vatAmount || 0), vatAmountX, textY, { align: "right" });
    doc.text(euro(item.lineTotal || 0), totalNetX, textY, { align: "right" });
    doc.text(euro(item.grossTotal || 0), totalGrossX, textY, { align: "right" });
    doc.setDrawColor(226, 232, 240);
    doc.line(leftX, y + rowHeight, rightX, y + rowHeight);
    y += rowHeight;
  });

  if (invoice.deliveryCost > 0) {
    const deliveryRowHeight = 10;
    if (y + deliveryRowHeight > tableBottomLimit) {
      doc.addPage("a4", "portrait");
      y = 24;
      drawInvoiceTableHeader(y);
      y += 8;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.2);
      doc.setTextColor(15, 23, 42);
    }
    const deliveryTextY = y + 3.5;
    doc.text("Toimituskulu", leftX + 2, deliveryTextY);
    doc.text("-", quantityX, deliveryTextY, { align: "right" });
    doc.text("-", unitPriceNetX, deliveryTextY, { align: "right" });
    doc.text("-", unitPriceGrossX, deliveryTextY, { align: "right" });
    doc.text(euro(invoice.deliveryVatAmount || 0), vatAmountX, deliveryTextY, { align: "right" });
    doc.text(euro(invoice.deliveryCost), totalNetX, deliveryTextY, { align: "right" });
    doc.text(euro((invoice.deliveryCost || 0) + (invoice.deliveryVatAmount || 0)), totalGrossX, deliveryTextY, { align: "right" });
    doc.setDrawColor(226, 232, 240);
    doc.line(leftX, y + deliveryRowHeight, rightX, y + deliveryRowHeight);
    y += deliveryRowHeight;
  }

  let paymentLines = [
    `Saajan nimi: ${invoice.sellerName || "-"}`,
    `IBAN: ${invoice.sellerIban || "-"}`,
    `BIC: ${invoice.sellerBic || "-"}`,
    `Viitenumero: ${invoice.referenceDisplay}`,
    `Erätunnus: ${invoice.batchId || "-"}`,
  ];
  if (invoice.acceptedSourceLabel) paymentLines.push(`Laskutusperuste: ${invoice.acceptedSourceLabel}`);
  if (invoice.catchDates.length > 0) paymentLines.push(`Pyyntipäivämäärä: ${invoice.catchDates.join(", ")}`);
  if (invoice.deliveryDate) paymentLines.push(`Toimituspäivä: ${invoice.deliveryDate}`);
  if (invoice.areaText) paymentLines.push(`Kalastamisalue: ${invoice.areaText}`);
  if (invoice.deliveryMethod) paymentLines.push(`Toimitustapa: ${invoice.deliveryMethod}`);

  const estimateWrappedHeight = (lines, maxWidth) => lines.reduce((total, text) => (
    total + (Math.max(1, doc.splitTextToSize(text, maxWidth).length) * lineHeight) + 1.4
  ), 0);

  const barcodeBlockHeight = 22;
  const sectionGap = 6;
  const totalsBoxHeight = 49;
  let invoiceBottomSectionStartY = y + 10;
  const paymentInfoHeight = 7 + estimateWrappedHeight(paymentLines, 102);
  const topSectionHeight = Math.max(paymentInfoHeight, totalsBoxHeight);
  if (invoiceBottomSectionStartY + topSectionHeight + sectionGap + barcodeBlockHeight > pageBottomY) {
    doc.addPage("a4", "portrait");
    invoiceBottomSectionStartY = 26;
  }
  let totalsY = invoiceBottomSectionStartY;
  doc.setFillColor(239, 246, 255);
  doc.roundedRect(122, totalsY - 8, 72, 49, 2, 2, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Tuotteet ALV 0 %", 126, totalsY);
  doc.text(euro(invoice.productTotal), 190, totalsY, { align: "right" });
  doc.text("Toimituskulu ALV 0 %", 126, totalsY + 7);
  doc.text(euro(invoice.deliveryCost), 190, totalsY + 7, { align: "right" });
  doc.text("Veroton yhteensä", 126, totalsY + 14);
  doc.text(euro(invoice.netTotal), 190, totalsY + 14, { align: "right" });
  doc.text(`ALV ${(invoice.vatRate * 100).toLocaleString("fi-FI")} % tuotteet`, 126, totalsY + 21);
  doc.text(euro(invoice.productVatAmount), 190, totalsY + 21, { align: "right" });
  doc.text(`ALV ${(invoice.vatRate * 100).toLocaleString("fi-FI")} % toimitus`, 126, totalsY + 28);
  doc.text(euro(invoice.deliveryVatAmount), 190, totalsY + 28, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Maksettava yhteensä", 126, totalsY + 37);
  doc.text(euro(invoice.grandTotal), 190, totalsY + 37, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  let paymentStartY = invoiceBottomSectionStartY;
  doc.text("Maksutiedot", leftX, paymentStartY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  let infoY = paymentStartY + 7;
  const drawInfoLine = (text) => {
    const wrappedLines = doc.splitTextToSize(text, 102);
    doc.text(wrappedLines, leftX, infoY);
    infoY += Math.max(1, wrappedLines.length) * lineHeight + 1.4;
  };
  paymentLines.forEach(drawInfoLine);

  const barcodeData = buildSellerInvoiceBankBarcode(invoice);
  if (barcodeData) {
    const barcodeTitleY = pageBottomY - 18;
    const barcodeBarsY = pageBottomY - 12;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text("Pankkiviivakoodi", leftX, barcodeTitleY);
    drawCode128SetCBarcode(doc, barcodeData, leftX, barcodeBarsY, 120, 12);
  }

  return { doc, invoice };
}

async function openSellerInvoicePdf(offer, sellerProfile) {
  const { doc, invoice } = await buildSellerInvoicePdfDoc(offer, sellerProfile);
  await presentPdfDocument(doc, `${invoice.invoiceNumber}.pdf`, { browserAction: "open" });
  return invoice;
}

async function openSellerGroupInvoicePdf(offers, sellerProfile) {
  const { doc, invoice } = await buildSellerGroupInvoicePdfDoc(offers, sellerProfile);
  await presentPdfDocument(doc, `${invoice.invoiceNumber}.pdf`, { browserAction: "open" });
  return invoice;
}

async function buildSellerInvoicePdf(offer, sellerProfile, documentKind = "invoice") {
  const { doc, invoice } = await buildSellerInvoicePdfDoc(offer, sellerProfile, { documentKind });
  const fileName = documentKind === "reminder" ? `${invoice.invoiceNumber}-maksumuistutus.pdf` : `${invoice.invoiceNumber}.pdf`;
  await presentPdfDocument(doc, fileName);
  return invoice;
}

async function buildSellerInvoiceEmailAttachment(offer, sellerProfile, documentKind = "invoice") {
  const { doc, invoice } = await buildSellerInvoicePdfDoc(offer, sellerProfile, { documentKind });
  const isReminder = documentKind === "reminder";
  return {
    invoice,
    documentKind,
    fileName: isReminder ? `${invoice.invoiceNumber}-maksumuistutus.pdf` : `${invoice.invoiceNumber}.pdf`,
    pdfBase64: String(doc.output("datauristring") || "").split(",")[1] || "",
  };
}

function getOfferBillingMonthValue(offer) {
  if (String(offer?.billing_month || "").trim()) return String(offer.billing_month).trim();
  try {
    const dateValue = new Date(offer?.updated_at || offer?.created_at || new Date().toISOString());
    return `${dateValue.getFullYear()}-${String(dateValue.getMonth() + 1).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

function getOwnerCommissionStatus(offer) {
  const status = String(offer?.owner_commission_status || "").trim();
  return ["invoiced", "paid", "unbilled"].includes(status) ? status : "unbilled";
}

function getOwnerCommissionStatusLabel(offer) {
  const status = getOwnerCommissionStatus(offer);
  if (status === "paid") return "Maksettu";
  if (status === "invoiced") return "Laskutettu";
  return "Laskuttamaton";
}

function resolveOwnerCommissionNumber(value, fallbackValue) {
  if (value === "" || value == null) return Number(fallbackValue || 0);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number(fallbackValue || 0);
}

function buildSellerGroupInvoiceReference(offers) {
  const monthDigits = String(getOfferBillingMonthValue(offers?.[0]) || today().slice(0, 7)).replace(/\D/g, "");
  const idDigits = (offers || []).map((offer) => String(offer?.id || "").replace(/\D/g, "")).join("").slice(-12);
  let baseDigits = `${monthDigits}${idDigits}`.replace(/^0+/, "").slice(-18);
  if (!baseDigits) baseDigits = "200";
  if (baseDigits.length < 3) baseDigits = baseDigits.padEnd(3, "0");
  return `${baseDigits}${calculateFinnishReferenceCheckDigit(baseDigits)}`;
}

function buildSellerGroupInvoiceNumber(offers) {
  const monthKey = String(getOfferBillingMonthValue(offers?.[0]) || today().slice(0, 7)).replace(/\D/g, "");
  const buyerPart = String(offers?.[0]?.buyer_id || offers?.[0]?.buyer_email || "OSTAJA").replace(/[^a-zA-Z0-9]+/g, "").slice(0, 6).toUpperCase() || "OSTAJA";
  return `KOONTI-${monthKey}-${buyerPart}`;
}

function buildSellerGroupInvoiceDueDate(offers) {
  const newestDate = (offers || [])
    .map((offer) => new Date(offer?.updated_at || offer?.created_at || new Date().toISOString()))
    .filter((value) => !Number.isNaN(value.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const dateValue = newestDate || new Date();
  dateValue.setDate(dateValue.getDate() + 14);
  return dateValue.toISOString().slice(0, 10);
}

function buildSellerGroupInvoiceLineItems(offers) {
  const rows = [];
  (offers || []).forEach((offer) => {
    const offerLineItems = parseSellerInvoiceLineItems(offer);
    const batchLabel = String(offer?.batch_id || "").trim();
    const deliveryDateLabel = formatInvoiceDeliveryDate(offer?.updated_at || offer?.created_at);
    const detailLine = [batchLabel ? `Erätunnus: ${batchLabel}` : "", deliveryDateLabel ? `Toimituspäivä: ${deliveryDateLabel}` : ""]
      .filter(Boolean)
      .join("\n");
    offerLineItems.forEach((item) => {
      rows.push({
        description: item.description || getOfferSpeciesHeadline(offer?.species_summary, { hideTraceability: true }) || "Kalaerä",
        detailLine,
        quantity: item.quantity,
        quantityDisplay: item.quantityDisplay,
        unit: item.unit,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
      });
    });
    const deliveryCost = Number(offer?.delivery_cost ?? offer?.route_price_eur ?? 0) || 0;
    if (deliveryCost > 0) {
      rows.push({
        description: "Toimituskulu",
        detailLine,
        quantity: 1,
        quantityDisplay: "1 kpl",
        unit: "kpl",
        unitPrice: deliveryCost,
        lineTotal: deliveryCost,
      });
    }
  });
  return rows;
}

function getSellerGroupInvoicePayload(offers, sellerProfile) {
  const sortedOffers = [...(offers || [])].sort((a, b) => new Date(a.updated_at || a.created_at || 0).getTime() - new Date(b.updated_at || b.created_at || 0).getTime());
  const firstOffer = sortedOffers[0] || {};
  const lineItems = buildSellerGroupInvoiceLineItems(sortedOffers);
  const vatRate = 0.135;
  const lineItemsWithVat = lineItems.map((item) => {
    const lineTotal = Number(item.lineTotal || 0);
    const vatAmount = lineTotal * vatRate;
    const unitPrice = Number(item.unitPrice || 0);
    return {
      ...item,
      unitPrice,
      unitGrossPrice: unitPrice + (unitPrice * vatRate),
      lineTotal,
      vatAmount,
      grossTotal: lineTotal + vatAmount,
    };
  });
  const productTotal = lineItemsWithVat.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
  const vatAmount = productTotal * vatRate;
  const grandTotal = productTotal + vatAmount;
  const referenceNumber = buildSellerGroupInvoiceReference(sortedOffers);
  const catchDates = Array.from(new Set(sortedOffers.flatMap((offer) => getOfferSummaryCatchDates(offer?.species_summary || ""))));
  const periodLabel = String(getOfferBillingMonthValue(firstOffer) || "").trim();

  return {
    invoiceNumber: buildSellerGroupInvoiceNumber(sortedOffers),
    invoiceDate: today(),
    dueDate: buildSellerGroupInvoiceDueDate(sortedOffers),
    referenceNumber,
    referenceDisplay: formatFinnishReferenceDisplay(referenceNumber),
    sellerName: String(sellerProfile?.company_name || sellerProfile?.display_name || sellerProfile?.email || "").trim() || "-",
    sellerBusinessId: String(sellerProfile?.business_id || "").trim(),
    sellerAddress: formatInvoicePartyAddress(sellerProfile?.address, sellerProfile?.postcode, sellerProfile?.city),
    sellerEmail: String(sellerProfile?.contact_email || sellerProfile?.email || "").trim(),
    sellerPhone: String(sellerProfile?.phone || "").trim(),
    sellerIban: String(sellerProfile?.bank_account_iban || "").trim(),
    sellerBic: String(sellerProfile?.bank_bic || "").trim(),
    buyerName: String(firstOffer?.buyer_company_name || firstOffer?.buyer_contact_name || firstOffer?.buyer_email || "").trim() || "Asiakas",
    buyerBusinessId: String(firstOffer?.buyer_business_id || "").trim(),
    buyerContactName: String(firstOffer?.buyer_contact_name || "").trim(),
    buyerBillingEmail: String(firstOffer?.buyer_billing_email || firstOffer?.buyer_email || "").trim(),
    buyerPhone: String(firstOffer?.buyer_phone || "").trim(),
    buyerBillingAddress: formatInvoicePartyAddress(firstOffer?.buyer_billing_address, firstOffer?.buyer_billing_postcode, firstOffer?.buyer_billing_city),
    buyerDeliveryAddress: formatInvoicePartyAddress(firstOffer?.buyer_delivery_address, firstOffer?.buyer_delivery_postcode, firstOffer?.buyer_delivery_city),
    periodLabel,
    catchDates,
    offerCount: sortedOffers.length,
    batchIds: sortedOffers.map((offer) => String(offer?.batch_id || "").trim()).filter(Boolean),
    lineItems: lineItemsWithVat,
    vatRate,
    productTotal,
    vatAmount,
    grandTotal,
  };
}

async function buildSellerGroupInvoicePdfDoc(offers, sellerProfile, options = {}) {
  const invoice = getSellerGroupInvoicePayload(offers, sellerProfile);
  const documentKind = options.documentKind === "reminder" ? "reminder" : "invoice";
  const isReminder = documentKind === "reminder";
  const logoDataUrl = await fetchImageDataUrl(getAppLogoUrl()).catch(() => "");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const leftX = 16;
  const rightX = 194;
  const lineHeight = 4.6;
  const tableBottomLimit = 207;
  const quantityX = 104;
  const unitPriceNetX = 124;
  const unitPriceGrossX = 144;
  const vatAmountX = 160;
  const totalNetX = 176;
  const totalGrossX = rightX - 2;
  const pageBottomY = 279;

  const drawInvoiceTableHeader = (headerY) => {
    doc.setFillColor(15, 23, 42);
    doc.rect(leftX, headerY - 6, 178, 9, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.8);
    doc.setTextColor(255, 255, 255);
    doc.text("Tuote", leftX + 2, headerY);
    doc.text("Määrä", quantityX, headerY, { align: "right" });
    doc.text("Yks. ALV 0 %", unitPriceNetX, headerY, { align: "right" });
    doc.text("Yks. ALV 13,5 %", unitPriceGrossX, headerY, { align: "right" });
    doc.text("ALV", vatAmountX, headerY, { align: "right" });
    doc.text("Yht. ALV 0 %", totalNetX, headerY, { align: "right" });
    doc.text("Yht. ALV 13,5 %", totalGrossX, headerY, { align: "right" });
  };

  const renderInvoiceColumn = (lines, x, startY, maxWidth) => {
    let columnY = startY;
    lines.forEach((line) => {
      const wrappedLines = doc.splitTextToSize(String(line), maxWidth);
      doc.text(wrappedLines, x, columnY);
      columnY += Math.max(1, wrappedLines.length) * lineHeight;
    });
    return columnY;
  };

  let y = 18;
  doc.setFillColor(239, 246, 255);
  doc.rect(0, 0, 210, 44, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(isReminder ? 18 : 22);
  doc.setTextColor(15, 23, 42);
  doc.text(isReminder ? "KOONTILASKUN MAKSUMUISTUTUS" : "KOONTILASKU", leftX, y + 2);
  doc.setFontSize(14);
  doc.setTextColor(30, 64, 175);
  doc.text("Suoraan Kalastajalta", leftX, y + 12);
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", leftX + 50, y + 0.8, 24, 15.2);
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.2);
  doc.setTextColor(15, 23, 42);
  if (invoice.periodLabel) {
    doc.text(`Laskutuskausi: ${invoice.periodLabel}`, leftX, y + 19);
  }
  doc.text(invoice.invoiceNumber, rightX, y + 1, { align: "right" });
  doc.text(`Laskun päiväys: ${invoice.invoiceDate}`, rightX, y + 8, { align: "right" });
  doc.text(`Eräpäivä: ${invoice.dueDate}`, rightX, y + 14, { align: "right" });

  y = 58;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Laskuttaja", leftX, y);
  doc.text("Laskutettava", 120, y);
  y += 6;

  const sellerLines = [
    invoice.sellerName,
    invoice.sellerBusinessId ? `Y-tunnus: ${invoice.sellerBusinessId}` : "",
    invoice.sellerAddress,
    invoice.sellerEmail,
    invoice.sellerPhone,
  ].filter(Boolean);
  const buyerLines = [
    invoice.buyerName,
    invoice.buyerBusinessId ? `Y-tunnus: ${invoice.buyerBusinessId}` : "",
    invoice.buyerContactName ? `Yhteyshenkilö: ${invoice.buyerContactName}` : "",
    invoice.buyerBillingAddress,
    invoice.buyerBillingEmail,
    invoice.buyerPhone,
    invoice.buyerDeliveryAddress ? `Toimitusosoite: ${invoice.buyerDeliveryAddress}` : "",
  ].filter(Boolean);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const sellerEndY = renderInvoiceColumn(sellerLines, leftX, y, 84);
  const buyerEndY = renderInvoiceColumn(buyerLines, 120, y, 70);

  y = Math.max(sellerEndY, buyerEndY) + 8;
  drawInvoiceTableHeader(y);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);

  invoice.lineItems.forEach((item) => {
    const titleLines = doc.splitTextToSize(item.description, 76);
    const detailLines = item.detailLine ? doc.splitTextToSize(String(item.detailLine), 76) : [];
    const rowHeight = Math.max(10, ((titleLines.length + detailLines.length) * lineHeight) + 4);
    if (y + rowHeight > tableBottomLimit) {
      doc.addPage("a4", "portrait");
      y = 24;
      drawInvoiceTableHeader(y);
      y += 8;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.2);
      doc.setTextColor(15, 23, 42);
    }
    const textY = y + 3.5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.2);
    doc.text(titleLines, leftX + 2, textY);
    if (detailLines.length > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.8);
      doc.setTextColor(71, 85, 105);
      doc.text(detailLines, leftX + 2, textY + (titleLines.length * lineHeight));
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(9.2);
    }
    doc.text(item.quantityDisplay || "-", quantityX, textY, { align: "right" });
    doc.text(item.unitPrice > 0 ? euro(item.unitPrice) : "-", unitPriceNetX, textY, { align: "right" });
    doc.text(item.unitGrossPrice > 0 ? euro(item.unitGrossPrice) : "-", unitPriceGrossX, textY, { align: "right" });
    doc.text(euro(item.vatAmount || 0), vatAmountX, textY, { align: "right" });
    doc.text(euro(item.lineTotal || 0), totalNetX, textY, { align: "right" });
    doc.text(euro(item.grossTotal || 0), totalGrossX, textY, { align: "right" });
    doc.setDrawColor(226, 232, 240);
    doc.line(leftX, y + rowHeight, rightX, y + rowHeight);
    y += rowHeight;
  });

  const paymentLines = [
    `Saajan nimi: ${invoice.sellerName || "-"}`,
    `IBAN: ${invoice.sellerIban || "-"}`,
    `BIC: ${invoice.sellerBic || "-"}`,
    `Viitenumero: ${invoice.referenceDisplay}`,
    invoice.periodLabel ? `Laskutuskausi: ${invoice.periodLabel}` : "",
    `Koottu ${invoice.offerCount} kaupasta`,
    invoice.batchIds.length > 0 ? `Erätunnukset: ${invoice.batchIds.join(", ")}` : "",
    invoice.catchDates.length > 0 ? `Pyyntipäivät: ${invoice.catchDates.join(", ")}` : "",
  ].filter(Boolean);

  const estimateWrappedHeight = (lines, maxWidth) => lines.reduce((total, text) => (
    total + (Math.max(1, doc.splitTextToSize(text, maxWidth).length) * lineHeight) + 1.4
  ), 0);

  const barcodeBlockHeight = 22;
  const sectionGap = 6;
  const totalsBoxHeight = 35;
  let bottomSectionStartY = y + 10;
  const paymentInfoHeight = 7 + estimateWrappedHeight(paymentLines, 102);
  const topSectionHeight = Math.max(paymentInfoHeight, totalsBoxHeight);
  if (bottomSectionStartY + topSectionHeight + sectionGap + barcodeBlockHeight > pageBottomY) {
    doc.addPage("a4", "portrait");
    bottomSectionStartY = 26;
  }

  let totalsY = bottomSectionStartY;
  doc.setFillColor(239, 246, 255);
  doc.roundedRect(122, totalsY - 8, 72, 35, 2, 2, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Veroton yhteensä", 126, totalsY);
  doc.text(euro(invoice.productTotal), 190, totalsY, { align: "right" });
  doc.text(`ALV ${(invoice.vatRate * 100).toLocaleString("fi-FI")} %`, 126, totalsY + 10);
  doc.text(euro(invoice.vatAmount), 190, totalsY + 10, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Maksettava yhteensä", 126, totalsY + 22);
  doc.text(euro(invoice.grandTotal), 190, totalsY + 22, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  let infoY = bottomSectionStartY;
  doc.text("Maksutiedot", leftX, infoY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  infoY += 7;

  const drawInfoLine = (text) => {
    const wrappedLines = doc.splitTextToSize(text, 102);
    doc.text(wrappedLines, leftX, infoY);
    infoY += Math.max(1, wrappedLines.length) * lineHeight + 1.4;
  };

  paymentLines.forEach(drawInfoLine);

  const barcodeData = buildSellerInvoiceBankBarcode(invoice);
  if (barcodeData) {
    const barcodeSectionY = bottomSectionStartY + topSectionHeight + sectionGap;
    const barcodeTitleY = barcodeSectionY;
    const barcodeBarsY = barcodeSectionY + 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text("Pankkiviivakoodi", leftX, barcodeTitleY);
    drawCode128SetCBarcode(doc, barcodeData, leftX, barcodeBarsY, 120, 12);
  }

  return { doc, invoice };
}

async function buildSellerGroupInvoicePdf(offers, sellerProfile, documentKind = "invoice") {
  const { doc, invoice } = await buildSellerGroupInvoicePdfDoc(offers, sellerProfile, { documentKind });
  const fileName = documentKind === "reminder" ? `${invoice.invoiceNumber}-maksumuistutus.pdf` : `${invoice.invoiceNumber}.pdf`;
  await presentPdfDocument(doc, fileName);
  return invoice;
}

async function buildSellerGroupInvoiceEmailAttachment(offers, sellerProfile, documentKind = "invoice") {
  const { doc, invoice } = await buildSellerGroupInvoicePdfDoc(offers, sellerProfile, { documentKind });
  const isReminder = documentKind === "reminder";
  return {
    invoice,
    documentKind,
    fileName: isReminder ? `${invoice.invoiceNumber}-maksumuistutus.pdf` : `${invoice.invoiceNumber}.pdf`,
    pdfBase64: String(doc.output("datauristring") || "").split(",")[1] || "",
  };
}

function buildInvoiceCopyRecipientTargets({
  buyerEmail,
  selfEmail,
  accountantEmail,
  sellerName,
  sendToSelf,
  sendToAccountant,
}) {
  const buyerEmailNormalized = normalizeEmail(buyerEmail || "");
  const recipientMap = new Map();
  const skipped = [];

  const registerRecipient = (rawEmail, label, recipientName) => {
    const normalizedEmail = normalizeEmail(rawEmail || "");
    if (!normalizedEmail) {
      skipped.push(label);
      return;
    }
    if (normalizedEmail === buyerEmailNormalized) return;
    const existingRecipient = recipientMap.get(normalizedEmail);
    if (existingRecipient) {
      existingRecipient.labels.push(label);
      return;
    }
    recipientMap.set(normalizedEmail, {
      email: normalizedEmail,
      recipientName,
      labels: [label],
    });
  };

  if (sendToSelf) {
    registerRecipient(selfEmail, "itselle", sellerName || "Kalastaja");
  }
  if (sendToAccountant) {
    registerRecipient(accountantEmail, "kirjanpitäjälle", "Kirjanpitäjä");
  }

  return {
    recipients: Array.from(recipientMap.values()).map((recipient) => ({
      ...recipient,
      label: recipient.labels.join(" ja "),
    })),
    skipped,
  };
}

function buildInvoiceCopyStatusText({ sentLabels, failedLabels, skippedLabels }) {
  const parts = [];
  if (sentLabels.length > 0) {
    parts.push(`Kopio lähetetty myös ${sentLabels.join(", ")}.`);
  }
  if (failedLabels.length > 0) {
    parts.push(`Kopion lähetys epäonnistui: ${failedLabels.join(", ")}.`);
  }
  if (skippedLabels.length > 0) {
    parts.push(`Kopiota ei voitu lähettää: ${skippedLabels.join(", ")} (sähköposti puuttuu).`);
  }
  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

function SellerBillingView({
  profile,
  accountForm,
  setAccountForm,
  sendInvoiceCopyToSelf,
  setSendInvoiceCopyToSelf,
  sendInvoiceCopyToAccountant,
  setSendInvoiceCopyToAccountant,
  accountSaving,
  onSaveBankDetails,
  buyerOffers,
  billingFilter,
  setBillingFilter,
  onOpenInvoicePdf,
  onViewInvoicePdf,
  onSendInvoicePdf,
  onUpdateBillingStatus,
  onOpenGroupInvoicePdf,
  onViewGroupInvoicePdf,
  onSendGroupInvoicePdf,
  onUpdateGroupBillingStatus,
}) {
  const hasFisherPremium = isFisherPremiumProfile(profile);
  const sellerDeliveredOffers = (buyerOffers || []).filter((offer) => (
    offer.status === "accepted" &&
    offer.fulfillment_status === "delivered" &&
    String(offer.seller_user_id || "") === String(profile?.id || "") &&
    (billingFilter === "all" || String(offer.billing_status || "unbilled") === billingFilter)
  ));

  const groupedInvoices = Object.values(sellerDeliveredOffers.reduce((acc, offer) => {
    const monthKey = getOfferBillingMonthValue(offer) || "Ei kuukautta";
    const buyerKey = String(offer.buyer_id || offer.buyer_email || "ostaja").trim().toLowerCase() || "ostaja";
    const groupKey = `${monthKey}__${buyerKey}`;
    if (!acc[groupKey]) {
      acc[groupKey] = {
        id: groupKey,
        monthKey,
        buyerLabel: offer.buyer_company_name || offer.buyer_contact_name || offer.buyer_email || "Ostaja",
        buyerBillingEmail: offer.buyer_billing_email || offer.buyer_email || "",
        billingStatus: offer.billing_status || "unbilled",
        offers: [],
      };
    }
    acc[groupKey].offers.push(offer);
    return acc;
  }, {})).sort((a, b) => {
    if (a.monthKey === b.monthKey) return a.buyerLabel.localeCompare(b.buyerLabel, "fi");
    return b.monthKey.localeCompare(a.monthKey, "fi");
  });

  return (
    <div style={styles.stack}>
      <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
        <div style={styles.rowBetween}>
          <div>
            <strong>Laskutus</strong>
            <div style={styles.muted}>Tänne tulevat hyväksytyt kaupat, kun ostaja on merkinnyt toimituksen toimitetuksi.</div>
          </div>
          <select style={styles.input} value={billingFilter} onChange={(e) => setBillingFilter(e.target.value)}>
            <option value="unbilled">Laskuttamattomat</option>
            <option value="invoiced">Laskutetut</option>
            <option value="paid">Maksetut</option>
            <option value="all">Kaikki</option>
          </select>
        </div>
      </div>

      {hasFisherPremium ? (
        <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack, background: "#f8fafc" }}>
          <div>
            <strong>Pankkitiedot laskulle</strong>
            <div style={styles.muted}>Nämä tallennetaan vain omiin profiilitietoihisi ja niitä käytetään laskusähköpostin muodostamiseen. Kaupan hyväksyntä estyy, jos pakolliset laskutustiedot puuttuvat. IBAN ei ole pakollinen kaupalle, mutta se tarvitaan jos lähetät laskuja suoraan sovelluksesta.</div>
          </div>
          <div style={styles.grid2}>
            <div style={styles.field}>
              <label>IBAN</label>
              <input
                style={styles.input}
                value={accountForm.bankAccountIban}
                onChange={(e) => setAccountForm((prev) => ({ ...prev, bankAccountIban: e.target.value }))}
                placeholder="FI00 0000 0000 0000 00"
                autoComplete="off"
              />
            </div>
            <div style={styles.field}>
              <label>BIC</label>
              <input
                style={styles.input}
                value={accountForm.bankBic}
                onChange={(e) => setAccountForm((prev) => ({ ...prev, bankBic: e.target.value }))}
                placeholder="Esim. NDEAFIHH"
                autoComplete="off"
              />
            </div>
            <div style={styles.field}>
              <label>Kirjanpitäjän sähköposti</label>
              <input
                style={styles.input}
                type="email"
                value={accountForm.accountantEmail}
                onChange={(e) => setAccountForm((prev) => ({ ...prev, accountantEmail: e.target.value }))}
                placeholder="kirjanpito@yritys.fi"
                autoComplete="off"
              />
            </div>
          </div>
          <div style={{ ...styles.stack, gap: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={sendInvoiceCopyToSelf}
                onChange={(e) => setSendInvoiceCopyToSelf(e.target.checked)}
              />
              <span>Lähetä laskun kopio itselleni</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={sendInvoiceCopyToAccountant}
                onChange={(e) => setSendInvoiceCopyToAccountant(e.target.checked)}
              />
              <span>Lähetä laskun kopio kirjanpitäjälle</span>
            </label>
          </div>
          {sendInvoiceCopyToAccountant && !String(accountForm.accountantEmail || "").trim() ? (
            <div style={styles.noticeError}>Lisää kirjanpitäjän sähköposti tai poista kirjanpitäjän kopion ruksi.</div>
          ) : null}
          <div style={{ ...styles.row, justifyContent: "flex-end" }}>
            <button style={{ ...styles.button, ...styles.primaryButton }} onClick={onSaveBankDetails} disabled={accountSaving}>
              {accountSaving ? "Tallennetaan..." : "Tallenna laskutusasetukset"}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack, background: "#f8fafc" }}>
          <strong>Laskutusasetukset</strong>
          <div style={styles.noticeInfo}>
            IBAN-, BIC- ja muut laskutusasetukset kuuluvat kalastajalisenssiin. Ilmaisversiossa niitä ei tarvitse täyttää.
          </div>
        </div>
      )}

      <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
        <div>
          <strong>Koontilaskut</strong>
          <div style={styles.muted}>Muodosta samalla ostajalle yksi lasku koko kuukauden toimitetuista kaupoista. Yksittäiset laskut säilyvät silti alla ennallaan.</div>
        </div>
        {groupedInvoices.length === 0 ? (
          <div style={styles.muted}>Ei koottavia kauppoja tällä suodattimella.</div>
        ) : (
          groupedInvoices.map((group) => {
            const invoicePayload = getSellerGroupInvoicePayload(group.offers, profile);
            const isReminderGroup = group.billingStatus === "invoiced";
            const isPaidGroup = group.billingStatus === "paid";
            const canCreateInvoicePdf = Boolean(accountForm.bankAccountIban.trim()) && Boolean(invoicePayload.buyerBillingEmail);
            return (
              <div key={group.id} style={{ ...styles.entry, background: "#f8fafc" }}>
                <div style={styles.rowBetween}>
                  <div>
                    <strong>{group.buyerLabel}</strong>
                    <div style={styles.muted}>Kuukausi: {group.monthKey}</div>
                  </div>
                  <span style={{ ...styles.badge, background: "#ecfdf5", borderColor: "#86efac" }}>
                    {group.billingStatus === "paid" ? "Maksettu" : group.billingStatus === "invoiced" ? "Laskutettu" : "Laskuttamaton"}
                  </span>
                </div>

                <div style={styles.entryBadges}>
                  <span style={styles.badge}>{group.offers.length} kauppaa</span>
                  <span style={styles.badge}>{euro(invoicePayload.productTotal)} veroton</span>
                  <span style={styles.badge}>ALV {(invoicePayload.vatRate * 100).toLocaleString("fi-FI")} % {euro(invoicePayload.vatAmount)}</span>
                  <span style={{ ...styles.badge, background: "#eff6ff" }}>{euro(invoicePayload.grandTotal)} koontilasku</span>
                </div>

                <div style={styles.muted}>Laskutussähköposti: {invoicePayload.buyerBillingEmail || "-"}</div>
                {invoicePayload.batchIds.length > 0 ? <div style={styles.muted}>Erätunnukset: {invoicePayload.batchIds.join(", ")}</div> : null}

                <div style={styles.row}>
                  {isReminderGroup ? (
                    <button
                      type="button"
                      style={styles.button}
                      onClick={() => onViewGroupInvoicePdf(group.offers)}
                      disabled={!accountForm.bankAccountIban.trim()}
                    >
                      Tarkastele koontilaskua (PDF)
                    </button>
                  ) : null}
                  <button
                    type="button"
                    style={styles.button}
                    onClick={() => onOpenGroupInvoicePdf(group.offers)}
                    disabled={!accountForm.bankAccountIban.trim()}
                  >
                    {isPaidGroup ? "Luo koontilaskun kopio PDF" : isReminderGroup ? "Luo koontimaksumuistutus (PDF)" : "Luo koontilasku (PDF)"}
                  </button>
                  {!isPaidGroup ? (
                    <button
                      type="button"
                      style={{ ...styles.button, ...styles.primaryButton }}
                      onClick={() => onSendGroupInvoicePdf(group.offers)}
                      disabled={!canCreateInvoicePdf}
                    >
                      {isReminderGroup ? "Lähetä koontimaksumuistutus" : "Lähetä koontilasku sähköpostilla"}
                    </button>
                  ) : null}
                  {group.billingStatus !== "paid" ? (
                    <button style={styles.button} onClick={() => onUpdateGroupBillingStatus(group.offers, "paid")}>Merkitse ryhmä maksetuksi</button>
                  ) : null}
                  {group.billingStatus !== "unbilled" ? (
                    <button style={styles.button} onClick={() => onUpdateGroupBillingStatus(group.offers, "unbilled")}>Palauta ryhmä laskuttamattomaksi</button>
                  ) : null}
                </div>

                {!accountForm.bankAccountIban.trim() ? (
                  <div style={styles.noticeError}>Lisää IBAN pankkitietoihin ennen koontilaskun muodostamista.</div>
                ) : null}
                {!invoicePayload.buyerBillingEmail ? (
                  <div style={styles.noticeError}>Ostajalle ei ole tallennettu laskutussähköpostia.</div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {sellerDeliveredOffers.length === 0 ? (
        <div style={{ ...styles.card, ...styles.sectionCard }}>
          <div style={styles.muted}>Ei vielä toimitettuja kauppoja laskutettavaksi tällä suodattimella.</div>
        </div>
      ) : (
        sellerDeliveredOffers.map((offer) => {
          const invoiceDetails = calculateSellerInvoiceDetails(offer);
          const invoicePayload = getSellerInvoicePayload(offer, profile);
          const canCreateInvoicePdf = Boolean(accountForm.bankAccountIban.trim()) && Boolean(invoicePayload.buyerBillingEmail);
          const isReminderOffer = offer.billing_status === "invoiced";
          const isPaidOffer = offer.billing_status === "paid";
          const billingAddress = [
            offer.buyer_billing_address,
            [offer.buyer_billing_postcode, offer.buyer_billing_city].filter(Boolean).join(" "),
          ].filter(Boolean).join(", ");
          const deliveryAddress = [
            offer.buyer_delivery_address,
            [offer.buyer_delivery_postcode, offer.buyer_delivery_city].filter(Boolean).join(" "),
          ].filter(Boolean).join(", ");

          return (
            <div key={offer.id} style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
              <div style={styles.rowBetween}>
                <div>
                  <strong>{offer.buyer_company_name || offer.buyer_contact_name || offer.buyer_email || "Ostaja"}</strong>
                  <div style={styles.muted}>Toimitettu: {offer.updated_at || offer.created_at || "-"}</div>
                </div>
                <span style={{ ...styles.badge, background: "#ecfdf5", borderColor: "#86efac" }}>
                  {offer.billing_status === "paid" ? "Maksettu" : offer.billing_status === "invoiced" ? "Laskutettu" : "Laskuttamaton"}
                </span>
              </div>

              <div style={styles.entryBadges}>
                <span style={styles.badge}>{invoiceDetails.kilos} kg</span>
                <span style={styles.badge}>{euro(invoiceDetails.netTotal)} veroton</span>
                <span style={styles.badge}>ALV {(invoiceDetails.vatRate * 100).toLocaleString("fi-FI")} % {euro(invoiceDetails.vatAmount)}</span>
                <span style={{ ...styles.badge, background: "#eff6ff" }}>{euro(invoiceDetails.grandTotal)} lasku</span>
              </div>

              <div style={{ ...styles.muted, whiteSpace: "pre-wrap" }}>
                <strong>Erä:</strong> {formatSpeciesSummaryText(offer.species_summary) || "-"}
              </div>
              {getOfferSummaryCatchDates(offer.species_summary).length > 0 ? (
                <div style={styles.muted}>
                  <strong>Pyyntipäivämäärä:</strong> {getOfferSummaryCatchDates(offer.species_summary).join(", ")}
                </div>
              ) : null}
              {offer.batch_id ? <div style={styles.muted}><strong>Erätunnus:</strong> {offer.batch_id}</div> : null}
              {offer.buyer_contact_name ? <div style={styles.muted}><strong>Yhteyshenkilö:</strong> {offer.buyer_contact_name}</div> : null}
              {offer.buyer_email ? <div style={styles.muted}><strong>Sähköposti:</strong> {offer.buyer_email}</div> : null}
              {offer.buyer_phone ? <div style={styles.muted}><strong>Puhelin:</strong> {offer.buyer_phone}</div> : null}
              {billingAddress ? <div style={styles.muted}><strong>Laskutusosoite:</strong> {billingAddress}</div> : null}
              {offer.buyer_billing_email ? <div style={styles.muted}><strong>Laskutussähköposti:</strong> {offer.buyer_billing_email}</div> : null}

              <div style={styles.row}>
                {isReminderOffer ? (
                  <button
                    type="button"
                    style={styles.button}
                    onClick={() => onViewInvoicePdf(offer)}
                    disabled={!accountForm.bankAccountIban.trim()}
                  >
                    Tarkastele laskua (PDF)
                  </button>
                ) : null}
                <button
                  type="button"
                  style={styles.button}
                  onClick={() => onOpenInvoicePdf(offer)}
                  disabled={!accountForm.bankAccountIban.trim()}
                >
                  {isPaidOffer ? "Luo laskukopio PDF" : isReminderOffer ? "Luo maksumuistutus (PDF)" : "Luo lasku (PDF)"}
                </button>
                {!isPaidOffer ? (
                  <button
                    type="button"
                    style={{ ...styles.button, ...styles.primaryButton }}
                    onClick={() => onSendInvoicePdf(offer)}
                    disabled={!canCreateInvoicePdf}
                  >
                    {isReminderOffer ? "Lähetä maksumuistutus sähköpostilla" : "Lähetä lasku sähköpostilla"}
                  </button>
                ) : null}
                {offer.billing_status !== "paid" ? (
                  <button style={styles.button} onClick={() => onUpdateBillingStatus(offer, "paid")}>Merkitse maksetuksi</button>
                ) : null}
                {offer.billing_status !== "unbilled" ? (
                  <button style={styles.button} onClick={() => onUpdateBillingStatus(offer, "unbilled")}>Palauta laskuttamattomaksi</button>
                ) : null}
              </div>

              {!accountForm.bankAccountIban.trim() ? (
                <div style={styles.noticeError}>Lisää IBAN pankkitietoihin ennen laskusähköpostin muodostamista.</div>
              ) : null}
              {!invoicePayload.buyerBillingEmail ? (
                <div style={styles.noticeError}>Ostajalle ei ole tallennettu laskutussähköpostia.</div>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}

export default function App() {
  const publicBatchId = getRequestedPublicBatchId();
  const requestedOfferId = getRequestedOfferId();
  const initialCatchDefaults = getStoredCatchFormDefaults();
  const initialGearDefaults = getStoredGearProfile(initialCatchDefaults, initialCatchDefaults.gear);
  const buyerOffersCompatFields = [
    "seller_business_id",
    "seller_address",
    "seller_postcode",
    "seller_city",
    "seller_contact_email",
    "seller_email",
    "seller_phone",
    "seller_commercial_fishing_id",
    "seller_bank_account_iban",
    "seller_bank_bic",
    "buyer_delivery_address",
    "buyer_delivery_postcode",
    "buyer_delivery_city",
    "buyer_billing_address",
    "buyer_billing_postcode",
    "buyer_billing_city",
    "buyer_billing_email",
    "buyer_business_id",
  ];
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1280));
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [availableRoleOptions, setAvailableRoleOptions] = useState([]);
  const [roleSelectionOpen, setRoleSelectionOpen] = useState(false);
  const [entries, setEntries] = useState([]);
  const [processedEntries, setProcessedEntries] = useState([]);
  const [offers, setOffers] = useState([]);
  const [buyerOffers, setBuyerOffers] = useState([]);
  const [buyerOffersFilter, setBuyerOffersFilter] = useState("open");
  const [billingFilter, setBillingFilter] = useState("unbilled");
  const [buyerOffersSearch, setBuyerOffersSearch] = useState("");
  const [buyerActiveOfferId, setBuyerActiveOfferId] = useState(null);
  const [buyerActionMode, setBuyerActionMode] = useState("counter");
  const [allowedUsers, setAllowedUsers] = useState([]);
  const [pendingProfiles, setPendingProfiles] = useState([]);
  const [ownerUserProfiles, setOwnerUserProfiles] = useState([]);
  const [appPushTokens, setAppPushTokens] = useState([]);
  const [buyers, setBuyers] = useState([]);
  const [processorSourceEntries, setProcessorSourceEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [entryScope, setEntryScope] = useState("own");
  const [authMode, setAuthMode] = useState("signin");
  const [authForm, setAuthForm] = useState({ email: "", password: "", confirmPassword: "", displayName: "", requestedRole: "member" });
  const [authError, setAuthError] = useState("");
  const [authInfo, setAuthInfo] = useState("");
  const [authWarning, setAuthWarning] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [activeTab, setActiveTab] = useState("dashboard");

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const updateViewportWidth = () => setViewportWidth(window.innerWidth);
    updateViewportWidth();
    window.addEventListener("resize", updateViewportWidth);
    window.addEventListener("orientationchange", updateViewportWidth);
    window.visualViewport?.addEventListener("resize", updateViewportWidth);
    return () => {
      window.removeEventListener("resize", updateViewportWidth);
      window.removeEventListener("orientationchange", updateViewportWidth);
      window.visualViewport?.removeEventListener("resize", updateViewportWidth);
    };
  }, []);

  useEffect(() => {
    if (!authInfo) return undefined;
    const timer = window.setTimeout(() => {
      setAuthInfo((current) => (current === authInfo ? "" : current));
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [authInfo]);

  const isBuyerOffersCompatColumnError = useCallback((error) => {
    const message = String(error?.message || "").toLowerCase();
    return message.includes("buyer_offers") &&
      message.includes("schema cache") &&
      buyerOffersCompatFields.some((field) => message.includes(field));
  }, [buyerOffersCompatFields]);
  const stripBuyerOffersCompatFields = useCallback((payload) => {
    if (!payload || typeof payload !== "object") return payload;
    const nextPayload = { ...payload };
    buyerOffersCompatFields.forEach((field) => {
      delete nextPayload[field];
    });
    return nextPayload;
  }, [buyerOffersCompatFields]);
  const updateBuyerOfferWithCompatFallback = useCallback(async (offerId, payload) => {
    let result = await supabase.from("buyer_offers").update(payload).eq("id", offerId);
    if (!result.error || !isBuyerOffersCompatColumnError(result.error)) return result;
    console.warn("buyer_offers update fallback: missing compat columns in schema cache", result.error.message);
    return supabase
      .from("buyer_offers")
      .update(stripBuyerOffersCompatFields(payload))
      .eq("id", offerId);
  }, [isBuyerOffersCompatColumnError, stripBuyerOffersCompatFields]);
  const [form, setForm] = useState(() => {
    const defaults = initialCatchDefaults;
    return {
      date: today(),
      area: defaults.area,
      waterType: defaults.waterType || "",
      municipality: defaults.municipality,
      landingPlace: defaults.landingPlace,
      gearCount: initialGearDefaults.gearCount,
      fishingDurationDays: initialGearDefaults.fishingDurationDays,
      originCity: "",
      selectedVesselId: "",
      fishingWithoutVessel: false,
      spot: "",
      gear: defaults.gear,
      netHeight: initialGearDefaults.netHeight,
      netMeshSize: initialGearDefaults.netMeshSize,
      fykeHeight: initialGearDefaults.fykeHeight,
      price_per_kg: "",
      notes: "",
      listForSale: false,
      offerToShops: false,
      offerToRestaurants: false,
      offerToWholesalers: false,
      deliveryPossible: false,
  deliveryMethod: "Myyjä toimittaa",
      transportMode: "",
      originPointId: "",
      transportCompanyId: "north-fresh-logistics",
      pickupAddress: "",
      pickupSurcharge: "",
      estimatedPickupTime: "",
      deliveryDestinations: initialCatchDefaults.deliveryDestinations || [],
      deliveryArea: initialCatchDefaults.deliveryArea || "",
      deliveryCost: "",
      earliestDeliveryDate: today(),
      coldTransport: false,
    };
  });
  const [savedCustomLakeAreas, setSavedCustomLakeAreas] = useState(() => initialCatchDefaults.customLakeAreas || []);
  const [savedCustomSeaAreas, setSavedCustomSeaAreas] = useState(() => initialCatchDefaults.customSeaAreas || []);
  const [catchAreaSelector, setCatchAreaSelector] = useState(() => resolveAreaSelectorValue(initialCatchDefaults.area, initialCatchDefaults.customLakeAreas, initialCatchDefaults.customSeaAreas));
  const [savedLandingPlaces, setSavedLandingPlaces] = useState(() => getStoredCatchFormDefaults().landingPlaces || []);
  const [savedGearProfiles, setSavedGearProfiles] = useState(() => initialCatchDefaults.gearProfiles || {});
  const [savedGearCountOptions, setSavedGearCountOptions] = useState(() => initialGearDefaults.gearCountOptions || []);
  const [savedFishingDurationOptions, setSavedFishingDurationOptions] = useState(() => initialGearDefaults.fishingDurationOptions || []);
  const [savedNetHeightOptions, setSavedNetHeightOptions] = useState(() => initialGearDefaults.netHeightOptions || []);
  const [savedNetMeshSizeOptions, setSavedNetMeshSizeOptions] = useState(() => initialGearDefaults.netMeshSizeOptions || []);
  const [savedFykeHeightOptions, setSavedFykeHeightOptions] = useState(() => initialGearDefaults.fykeHeightOptions || []);
  const [speciesRows, setSpeciesRows] = useState([createSpeciesRow()]);
  const [processedForm, setProcessedForm] = useState(createInitialProcessedForm);
  const [processedProducts, setProcessedProducts] = useState([]);
  const [selectedProcessedProductId, setSelectedProcessedProductId] = useState("");
  const [saveProcessedAsProduct, setSaveProcessedAsProduct] = useState(false);
  const [processedRecipeRows, setProcessedRecipeRows] = useState([createProcessedRecipeRow()]);
  const [processedAreaSelector, setProcessedAreaSelector] = useState(() => resolveAreaSelectorValue("Saimaa", initialCatchDefaults.customLakeAreas, initialCatchDefaults.customSeaAreas));
  const [newAllowedForm, setNewAllowedForm] = useState({ email: "", displayName: "", role: "member", buyer_id: "" });
  const [buyerAction, setBuyerAction] = useState({
    counter_price_per_kg: "",
    counter_price_per_kg_gross_input: "",
    mixed_counter_prices: {},
    mixed_counter_prices_gross: {},
    reserved_kilos: "",
    buyer_message: "",
  });
  const [buyerOfferInlineError, setBuyerOfferInlineError] = useState({ offerId: "", message: "" });
  const [offerForm, setOfferForm] = useState({
    company_name: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    offer_price_per_kg: "",
    message: "",
  });
  const [userMessage, setUserMessage] = useState("");
  const [buyerForm, setBuyerForm] = useState({
    id: "",
    company_name: "",
    buyer_type: "ravintola",
    contact_name: "",
    email: "",
    phone: "",
    city: "",
    min_kg: "",
    max_kg: "",
    is_active: true,
    notes: "",
    delivery_address: "",
    delivery_postcode: "",
    delivery_city: "",
    billing_address: "",
    billing_postcode: "",
    billing_city: "",
    billing_email: "",
    business_id: "",
  });
  const [buyerBillingSameAsDelivery, setBuyerBillingSameAsDelivery] = useState(false);
  const [fisherInfoForm, setFisherInfoForm] = useState({
    commercialFishingId: "",
    commercialFishingVesselId: "",
    commercialFishingVesselIdsText: "",
    eviraFacilityId: "",
  });
  const [fisherInfoDirty, setFisherInfoDirty] = useState(false);
  const [accountPanelOpen, setAccountPanelOpen] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const [deletingOwnTestBuyerOffers, setDeletingOwnTestBuyerOffers] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const foregroundNotificationRef = useRef({ key: "", at: 0 });
  const pushRegistrationKeyRef = useRef("");
  const currentPushTokenRef = useRef("");
  const tabsScrollRef = useRef(null);
  const [tabsOverflowing, setTabsOverflowing] = useState(false);
  const [showTabsScrollHint, setShowTabsScrollHint] = useState(false);
  const isCompactTabs = viewportWidth < 900;
  const [accountForm, setAccountForm] = useState({
    displayName: "",
    buyerType: "ravintola",
    minKg: "",
    maxKg: "",
    eviraFacilityId: "",
    commercialFishingVesselId: "",
    commercialFishingVesselIdsText: "",
    commercialFishingId: "",
    vatLiable: false,
    vatNumber: "",
    pickupAddress: "",
    companyName: "",
    businessId: "",
    address: "",
    postcode: "",
    city: "",
    billingAddress: "",
    billingPostcode: "",
    billingCity: "",
    billingEmail: "",
    einvoiceAddress: "",
    bankAccountIban: "",
    bankBic: "",
    contactEmail: "",
    accountantEmail: "",
    phone: "",
    waterType: "",
    contactName: "",
    deliveryAddress: "",
    deliveryPostcode: "",
    deliveryCity: "",
    notes: "",
  });
  const [sendInvoiceCopyToSelf, setSendInvoiceCopyToSelf] = useState(true);
  const [sendInvoiceCopyToAccountant, setSendInvoiceCopyToAccountant] = useState(false);
  const [accountFormDirty, setAccountFormDirty] = useState(false);
  const [accountBillingSameAsDelivery, setAccountBillingSameAsDelivery] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ newPassword: "", confirmPassword: "" });
  const [publicBatchData, setPublicBatchData] = useState(null);
  const [publicBatchLoading, setPublicBatchLoading] = useState(Boolean(publicBatchId));
  const [publicBatchError, setPublicBatchError] = useState("");
  const [slowBoot, setSlowBoot] = useState(false);
  const [labelPrintEntry, setLabelPrintEntry] = useState(null);
  const [labelPrintCount, setLabelPrintCount] = useState(10);
  const [labelPrintFormat, setLabelPrintFormat] = useState(CATCH_LABEL_FORMAT_MUNBYN_4X6);
  const [labelPrintWaterType, setLabelPrintWaterType] = useState("");
  const [onboardingGuideState, setOnboardingGuideState] = useState({ views: 0, hiddenForever: false, visible: false });
  const accountFormSyncingRef = useRef(false);
  const fisherInfoSyncingRef = useRef(false);
  const accountFormInitializedRef = useRef(false);
  const catchDefaultsStorageKeyRef = useRef(getCatchFormDefaultsStorageKey(null));
  const labelModalHistoryActiveRef = useRef(false);

  useEffect(() => {
    const tabScroller = tabsScrollRef.current;
    const shouldTrackScrollHint = Boolean(tabScroller) && isCompactTabs && profile?.role !== "buyer";

    if (!shouldTrackScrollHint) {
      setTabsOverflowing(false);
      setShowTabsScrollHint(false);
      return undefined;
    }

    const updateScrollHintState = () => {
      const maxScrollLeft = Math.max(0, tabScroller.scrollWidth - tabScroller.clientWidth);
      const hasOverflow = maxScrollLeft > 16;
      const isNearStart = tabScroller.scrollLeft < 24;
      setTabsOverflowing(hasOverflow);
      setShowTabsScrollHint(hasOverflow && isNearStart);
    };

    updateScrollHintState();
    tabScroller.addEventListener("scroll", updateScrollHintState, { passive: true });
    window.addEventListener("resize", updateScrollHintState);

    return () => {
      tabScroller.removeEventListener("scroll", updateScrollHintState);
      window.removeEventListener("resize", updateScrollHintState);
    };
  }, [isCompactTabs, profile?.role, viewportWidth, availableRoleOptions.length]);

  useEffect(() => {
    const nextStorageKey = getCatchFormDefaultsStorageKey(profile);
    if (catchDefaultsStorageKeyRef.current === nextStorageKey) return;

    catchDefaultsStorageKeyRef.current = nextStorageKey;
    const defaults = getStoredCatchFormDefaults(profile);
    const gearDefaults = getStoredGearProfile(defaults, defaults.gear);

    setForm((prev) => ({
      ...prev,
      area: defaults.area,
      waterType: defaults.waterType || String(profile?.water_type || "").trim(),
      municipality: defaults.municipality,
      landingPlace: defaults.landingPlace,
      gearCount: gearDefaults.gearCount,
      fishingDurationDays: gearDefaults.fishingDurationDays,
      gear: defaults.gear,
      netHeight: gearDefaults.netHeight,
      netMeshSize: gearDefaults.netMeshSize,
      fykeHeight: gearDefaults.fykeHeight,
      deliveryDestinations: defaults.deliveryDestinations || [],
      deliveryArea: defaults.deliveryArea || "",
    }));
    setSavedCustomLakeAreas(defaults.customLakeAreas || []);
    setSavedCustomSeaAreas(defaults.customSeaAreas || []);
    setCatchAreaSelector(resolveAreaSelectorValue(defaults.area, defaults.customLakeAreas, defaults.customSeaAreas));
    setSavedLandingPlaces(defaults.landingPlaces || []);
    setSavedGearProfiles(defaults.gearProfiles || {});
    setSavedGearCountOptions(gearDefaults.gearCountOptions || []);
    setSavedFishingDurationOptions(gearDefaults.fishingDurationOptions || []);
    setSavedNetHeightOptions(gearDefaults.netHeightOptions || []);
    setSavedNetMeshSizeOptions(gearDefaults.netMeshSizeOptions || []);
    setSavedFykeHeightOptions(gearDefaults.fykeHeightOptions || []);
    setProcessedForm((prev) => ({
      ...prev,
      deliveryDestinations: defaults.deliveryDestinations || [],
      deliveryArea: defaults.deliveryArea || "",
    }));
    setProcessedAreaSelector(resolveAreaSelectorValue("Saimaa", defaults.customLakeAreas, defaults.customSeaAreas));
  }, [profile]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handlePopState = () => {
      if (!labelPrintEntry) return;
      labelModalHistoryActiveRef.current = false;
      setLabelPrintEntry(null);
    };

    if (labelPrintEntry && !labelModalHistoryActiveRef.current) {
      window.history.pushState({ labelPrintModal: true }, "");
      labelModalHistoryActiveRef.current = true;
      window.addEventListener("popstate", handlePopState);
      return () => {
        window.removeEventListener("popstate", handlePopState);
      };
    }

    if (!labelPrintEntry) {
      labelModalHistoryActiveRef.current = false;
    }

    return undefined;
  }, [labelPrintEntry]);

  const closeLabelPrintModal = useCallback(() => {
    if (typeof window !== "undefined" && labelModalHistoryActiveRef.current) {
      labelModalHistoryActiveRef.current = false;
      window.history.back();
      return;
    }
    setLabelPrintWaterType("");
    setLabelPrintEntry(null);
  }, []);
  const fisherInfoInitializedRef = useRef(false);

  const getMatchingAllowedRole = useCallback((allowedRows, currentProfile) => {
    if (!currentProfile) return null;
    return (allowedRows || []).find((row) => (
      row.role === currentProfile.role &&
      String(row.buyer_id || "") === String(currentProfile.buyer_id || "")
    )) || null;
  }, []);

  const getBuyerRecordCompletenessScore = useCallback((buyer, preferredBuyerId = "") => {
    const dataScore = [
      buyer?.billing_email,
      buyer?.billing_address,
      buyer?.billing_postcode,
      buyer?.billing_city,
      buyer?.delivery_address,
      buyer?.delivery_postcode,
      buyer?.delivery_city,
      buyer?.company_name,
      buyer?.business_id,
      buyer?.contact_name,
      buyer?.phone,
    ].filter((value) => String(value || "").trim()).length;
    const preferredBonus = String(buyer?.id || "") === String(preferredBuyerId || "") ? 0.01 : 0;
    return preferredBonus + dataScore;
  }, []);

  const buyerLoginEmail = normalizeEmail(profile?.email);
  const buyerContactEmail = normalizeEmail(profile?.contact_email);

  const buyerIdentityEmails = useMemo(() => Array.from(new Set([
    buyerLoginEmail,
    buyerContactEmail,
  ].filter(Boolean))), [buyerContactEmail, buyerLoginEmail]);

  const buyerCandidateRecords = useMemo(() => {
    if (!profile || profile.role !== "buyer") return null;
    const exactIdCandidates = buyers.filter((buyer) => String(buyer.id || "") === String(profile.buyer_id || ""));
    if (exactIdCandidates.length > 0) return exactIdCandidates;

    const loginEmailCandidates = buyers.filter((buyer) => (
      buyerLoginEmail &&
      normalizeEmail(buyer.email) === buyerLoginEmail
    ));
    if (loginEmailCandidates.length > 0) return loginEmailCandidates;

    const contactEmailCandidates = buyers.filter((buyer) => (
      buyerContactEmail &&
      normalizeEmail(buyer.email) === buyerContactEmail
    ));
    if (contactEmailCandidates.length > 0) return contactEmailCandidates;
    return [];
  }, [buyerContactEmail, buyerLoginEmail, buyers, profile]);

  const linkedBuyerRecord = useMemo(() => {
    if (!buyerCandidateRecords || buyerCandidateRecords.length === 0) return null;

    return [...buyerCandidateRecords].sort((a, b) => (
      getBuyerRecordCompletenessScore(b, profile.buyer_id) -
      getBuyerRecordCompletenessScore(a, profile.buyer_id)
    ))[0] || null;
  }, [buyerCandidateRecords, getBuyerRecordCompletenessScore, profile?.buyer_id]);

  const buyerOfferIdentityFilters = useMemo(() => {
    if (!profile || profile.role !== "buyer") return [];
    const filters = [];
    const buyerIds = Array.from(new Set([
      String(profile?.buyer_id || "").trim(),
      String(linkedBuyerRecord?.id || "").trim(),
      ...(buyerCandidateRecords || []).map((buyer) => String(buyer?.id || "").trim()).filter(Boolean),
    ].filter(Boolean)));
    buyerIds.forEach((buyerId) => {
      filters.push(`buyer_id.eq.${buyerId}`);
    });

    const identityEmails = Array.from(new Set([
      ...buyerIdentityEmails,
      normalizeEmail(linkedBuyerRecord?.email),
      ...(buyerCandidateRecords || []).map((buyer) => normalizeEmail(buyer?.email)).filter(Boolean),
    ].filter(Boolean)));
    identityEmails.forEach((email) => {
      filters.push(`buyer_email.eq.${email}`);
    });

    return filters;
  }, [buyerCandidateRecords, buyerIdentityEmails, linkedBuyerRecord?.email, linkedBuyerRecord?.id, profile]);

  const activeRoleOption = useMemo(
    () => getMatchingAllowedRole(availableRoleOptions, profile),
    [availableRoleOptions, getMatchingAllowedRole, profile],
  );
  const hasFisherPremium = useMemo(
    () => isFisherPremiumProfile(profile),
    [profile],
  );
  const hasBuyerRoleOption = useMemo(
    () => (availableRoleOptions || []).some((option) => option.role === "buyer"),
    [availableRoleOptions],
  );
  const hasProcessorRoleOption = useMemo(
    () => (availableRoleOptions || []).some((option) => option.role === "processor"),
    [availableRoleOptions],
  );
  const commercialFishingVesselOptions = useMemo(
    () => getCommercialFishingVesselIds(profile),
    [profile],
  );

  const showFisherPremiumRequired = useCallback((featureLabel) => {
    setAuthError("");
    setAuthInfo("");
    setAuthWarning(buildFisherPremiumMessage(featureLabel));
    setAccountPanelOpen(true);
  }, []);

  const handleNotificationNavigation = useCallback((payload = {}) => {
    const nextTab = getNotificationRouteTarget(payload);
    if (nextTab) {
      setActiveTab(nextTab);
    }
    if (nextTab === "offers" && profile?.role === "buyer") {
      setBuyerOffersFilter("open");
      if (String(payload.eventType || "").trim() === "offer_accepted") {
        setBuyerActiveOfferId(null);
        return;
      }
    }
    if (String(payload.offerId || "").trim()) {
      setBuyerActiveOfferId(String(payload.offerId).trim());
      setBuyerActionMode("counter");
    }
  }, [profile?.role]);

  const sendPushEvent = useCallback(async ({
    targetUserId = "",
    targetBuyerId = "",
    targetBuyerEmail = "",
    title = "",
    body = "",
    eventType = "",
    route = "offers",
    offerId = "",
    batchId = "",
  }) => {
    const trimmedTitle = String(title || "").trim();
    const trimmedBody = String(body || "").trim();
    if (!trimmedTitle || !trimmedBody) return;
    if (!String(targetUserId || "").trim() && !String(targetBuyerId || "").trim()) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    try {
      const result = await invokeEdgeFunctionAuthenticated("send-push-notification", {
        targetUserId: String(targetUserId || "").trim() || null,
        targetBuyerId: String(targetBuyerId || "").trim() || null,
        targetBuyerEmail: String(targetBuyerEmail || "").trim().toLowerCase() || null,
        title: trimmedTitle,
        body: trimmedBody,
        eventType: String(eventType || "").trim() || "general",
        data: {
          route,
          offerId: String(offerId || "").trim(),
          batchId: String(batchId || "").trim(),
        },
      }, accessToken);
      const skipReason = String(result?.data?.reason || "").trim();
      if (result?.error) {
        console.warn("Push notification failed", {
          targetUserId: String(targetUserId || "").trim() || null,
          targetBuyerId: String(targetBuyerId || "").trim() || null,
          eventType,
          error: result.error,
        });
      } else if (result?.data?.skipped) {
        console.warn("Push notification skipped", {
          targetUserId: String(targetUserId || "").trim() || null,
          targetBuyerId: String(targetBuyerId || "").trim() || null,
          eventType,
          reason: skipReason || "unknown",
          tokens: result?.data?.tokens || 0,
        });
      }
      return result;
    } catch (error) {
      console.warn("Push notification invocation threw", {
        targetUserId: String(targetUserId || "").trim() || null,
        targetBuyerId: String(targetBuyerId || "").trim() || null,
        eventType,
        error: error instanceof Error ? error.message : String(error),
      });
      return { data: null, error };
    }
  }, []);

  const notifyOwnersAboutPendingApproval = useCallback(async (pendingProfile) => {
    const pendingUserId = String(pendingProfile?.id || "").trim();
    if (!pendingUserId) return;

    const { data: ownerProfiles, error } = await supabase
      .from("profiles")
      .select("id, role, is_active")
      .eq("role", "owner")
      .eq("is_active", true);

    if (error || !Array.isArray(ownerProfiles) || ownerProfiles.length === 0) {
      return;
    }

    const pendingLabel = String(pendingProfile?.display_name || pendingProfile?.email || "Uusi käyttäjä").trim();
    const pendingRole = roleLabel(pendingProfile?.role || "member");

    await Promise.all(
      ownerProfiles
        .map((owner) => String(owner?.id || "").trim())
        .filter((ownerId) => ownerId && ownerId !== pendingUserId)
        .map((ownerId) =>
          sendPushEvent({
            targetUserId: ownerId,
            title: "Uusi käyttäjä odottaa hyväksyntää",
            body: `${pendingLabel} (${pendingRole}) odottaa ylläpitäjän hyväksyntää.`,
            eventType: "pending_user_approval",
            route: "users",
          })
        ),
    );
  }, [sendPushEvent]);

  const registerPushTokenOwnership = useCallback(async ({
    token,
    buyerId = "",
    platform = "android",
    deviceLabel = "android-app",
  }) => {
    const trimmedToken = String(token || "").trim();
    if (!trimmedToken) {
      return { data: null, error: { message: "Missing push token" } };
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    return invokeEdgeFunctionAuthenticated("register-push-token", {
      token: trimmedToken,
      buyerId: String(buyerId || "").trim() || null,
      platform,
      deviceLabel,
    }, accessToken);
  }, []);

  const unregisterPushTokenOwnership = useCallback(async (token = "") => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) return { data: null, error: null };

    return invokeEdgeFunctionAuthenticated("unregister-push-token", {
      token: String(token || "").trim() || null,
    }, accessToken);
  }, []);

  const formatBuyerCounterNetPrice = useCallback((value) => {
    const parsed = parseLocaleNumber(value);
    return parsed == null
      ? ""
      : parsed.toLocaleString("fi-FI", { maximumFractionDigits: 4 });
  }, []);

  const updateBuyerCounterNetPrice = useCallback((value) => {
    setBuyerAction((prev) => ({
      ...prev,
      counter_price_per_kg: value,
      counter_price_per_kg_gross_input: "",
    }));
  }, []);

  const updateBuyerCounterGrossPrice = useCallback((value) => {
    setBuyerAction((prev) => {
      if (value === "") {
        return {
          ...prev,
          counter_price_per_kg: "",
          counter_price_per_kg_gross_input: "",
        };
      }

      const parsedGross = parseLocaleNumber(value);
      const parsedNet = parsedGross == null ? null : calculateNetPrice(parsedGross);
      return {
        ...prev,
        counter_price_per_kg_gross_input: value,
        counter_price_per_kg: parsedNet == null ? prev.counter_price_per_kg : formatBuyerCounterNetPrice(parsedNet),
      };
    });
  }, [formatBuyerCounterNetPrice]);

  const updateBuyerMixedCounterNetPrice = useCallback((rowKey, value) => {
    setBuyerAction((prev) => ({
      ...prev,
      mixed_counter_prices: {
        ...(prev.mixed_counter_prices || {}),
        [rowKey]: value,
      },
      mixed_counter_prices_gross: {
        ...(prev.mixed_counter_prices_gross || {}),
        [rowKey]: "",
      },
    }));
  }, []);

  const updateBuyerMixedCounterGrossPrice = useCallback((rowKey, value) => {
    setBuyerAction((prev) => {
      const nextNetPrices = { ...(prev.mixed_counter_prices || {}) };
      const nextGrossPrices = { ...(prev.mixed_counter_prices_gross || {}) };

      if (value === "") {
        nextNetPrices[rowKey] = "";
        nextGrossPrices[rowKey] = "";
        return {
          ...prev,
          mixed_counter_prices: nextNetPrices,
          mixed_counter_prices_gross: nextGrossPrices,
        };
      }

      const parsedGross = parseLocaleNumber(value);
      const parsedNet = parsedGross == null ? null : calculateNetPrice(parsedGross);
      nextGrossPrices[rowKey] = value;
      nextNetPrices[rowKey] = parsedNet == null ? nextNetPrices[rowKey] || "" : formatBuyerCounterNetPrice(parsedNet);

      return {
        ...prev,
        mixed_counter_prices: nextNetPrices,
        mixed_counter_prices_gross: nextGrossPrices,
      };
    });
  }, [formatBuyerCounterNetPrice]);

  useEffect(() => {
    if (!session?.user?.id || !profile?.id || !isNativeCapacitorApp()) return undefined;

    const registrationKey = [
      session.user.id,
      profile.id,
      profile.role,
      linkedBuyerRecord?.id || "",
    ].join(":");
    if (pushRegistrationKeyRef.current === registrationKey) {
      return undefined;
    }

    let cancelled = false;
    const removeHandles = [];
    let retryTimeoutId = null;

    const clearRetryTimeout = () => {
      if (retryTimeoutId != null && typeof window !== "undefined") {
        window.clearTimeout(retryTimeoutId);
      }
      retryTimeoutId = null;
    };

    const resetRegistrationKey = () => {
      if (pushRegistrationKeyRef.current === registrationKey) {
        pushRegistrationKeyRef.current = "";
      }
    };

    const scheduleRetry = (reason) => {
      if (cancelled || typeof window === "undefined" || retryTimeoutId != null) return;
      resetRegistrationKey();
      console.warn("[PUSH] scheduling retry", JSON.stringify({
        reason: String(reason || "unknown"),
        registrationKey,
      }));
      retryTimeoutId = window.setTimeout(() => {
        retryTimeoutId = null;
        if (!cancelled) {
          void registerPushNotifications();
        }
      }, 15000);
    };

    const resolveBuyerIdForPush = async () => {
      let resolvedBuyerId = linkedBuyerRecord?.id || profile.buyer_id || null;

      if (!resolvedBuyerId && profile.role === "buyer") {
        const candidateEmails = Array.from(new Set([
          normalizeEmail(profile.email),
          normalizeEmail(session.user?.email),
          normalizeEmail(profile.contact_email),
          normalizeEmail(profile.billing_email),
        ].filter(Boolean)));

        for (const candidateEmail of candidateEmails) {
          const { data: buyerMatch, error: buyerMatchError } = await supabase
            .from("buyers")
            .select("id")
            .or(`email.eq.${candidateEmail},billing_email.eq.${candidateEmail}`)
            .limit(1)
            .maybeSingle();

          if (buyerMatchError) {
            console.error("[PUSH] buyer lookup failed", JSON.stringify({
              email: candidateEmail,
              error: buyerMatchError.message || String(buyerMatchError),
            }));
            continue;
          }

          if (buyerMatch?.id) {
            resolvedBuyerId = buyerMatch.id;
            break;
          }
        }

        if (resolvedBuyerId && String(profile.buyer_id || "") !== String(resolvedBuyerId)) {
          const { error: profileUpdateError } = await supabase
            .from("profiles")
            .update({ buyer_id: resolvedBuyerId })
            .eq("id", profile.id);

          if (profileUpdateError) {
            console.error("[PUSH] buyer link profile update failed", JSON.stringify({
              profileId: profile.id,
              buyerId: resolvedBuyerId,
              error: profileUpdateError.message || String(profileUpdateError),
            }));
          } else {
            setProfile((prev) => (prev ? { ...prev, buyer_id: resolvedBuyerId } : prev));
          }
        }
      }

      return resolvedBuyerId || "";
    };

    const registerPushNotifications = async () => {
      try {
        const permissionStatus = await PushNotifications.requestPermissions();
        if (permissionStatus.receive !== "granted") {
          resetRegistrationKey();
          console.warn("[PUSH] permission not granted", JSON.stringify({
            receive: permissionStatus.receive || "unknown",
            registrationKey,
          }));
          return;
        }

        try {
          await LocalNotifications.requestPermissions();
        } catch {
          // ignore local permission failure
        }

        try {
          await PushNotifications.createChannel({
            id: PUSH_CHANNEL_ID,
            name: "Kauppailmoitukset",
            description: "Tarjoukset, varaukset, kaupat ja laskutus",
            importance: 5,
            visibility: 1,
            sound: PUSH_SOUND_NAME,
            vibration: true,
          });
        } catch {
          // channel may already exist
        }

        try {
          await LocalNotifications.createChannel({
            id: PUSH_CHANNEL_ID,
            name: "Kauppailmoitukset",
            description: "Tarjoukset, varaukset, kaupat ja laskutus",
            importance: 5,
            visibility: 1,
            sound: PUSH_SOUND_NAME,
            vibration: true,
          });
        } catch {
          // channel may already exist
        }

        try {
          const { value: storedPushToken } = await Preferences.get({ key: PUSH_TOKEN_STORAGE_KEY });
          const normalizedStoredToken = String(storedPushToken || "").trim();
          if (normalizedStoredToken) {
            const resolvedBuyerId = await resolveBuyerIdForPush();
            const restoredRegisterResult = await registerPushTokenOwnership({
              token: normalizedStoredToken,
              buyerId: resolvedBuyerId,
              platform: "android",
              deviceLabel: "android-app",
            });

            if (restoredRegisterResult?.error) {
              console.error("[PUSH] stored token restore failed", JSON.stringify({
                profileId: profile.id,
                buyerId: resolvedBuyerId || null,
                role: profile.role || "member",
                error: restoredRegisterResult.error.message || String(restoredRegisterResult.error),
              }));
            } else {
              currentPushTokenRef.current = normalizedStoredToken;
              console.log("[PUSH] stored token reactivated", JSON.stringify({
                profileId: profile.id,
                buyerId: restoredRegisterResult?.data?.buyerId || resolvedBuyerId || null,
                role: restoredRegisterResult?.data?.role || profile.role || "member",
                registrationKey,
              }));
            }
          }
        } catch (restoreError) {
          console.error("[PUSH] stored token restore handler failed", JSON.stringify({
            error: restoreError instanceof Error ? restoreError.message : String(restoreError),
            registrationKey,
          }));
        }

        const registrationHandle = await PushNotifications.addListener("registration", async (token) => {
          if (cancelled || !token?.value) return;
          try {
            const resolvedBuyerId = await resolveBuyerIdForPush();

            const registerResult = await registerPushTokenOwnership({
              token: token.value,
              buyerId: resolvedBuyerId,
              platform: "android",
              deviceLabel: "android-app",
            });

            if (registerResult?.error) {
              console.error("[PUSH] token register failed", JSON.stringify({
                profileId: profile.id,
                buyerId: resolvedBuyerId,
                role: profile.role || "member",
                error: registerResult.error.message || String(registerResult.error),
              }));
              scheduleRetry("token_register_failed");
              return;
            }

            currentPushTokenRef.current = token.value;
            pushRegistrationKeyRef.current = registrationKey;
            await Preferences.set({
              key: PUSH_TOKEN_STORAGE_KEY,
              value: token.value,
            });
            console.log("[PUSH] token registered", JSON.stringify({
              profileId: profile.id,
              buyerId: registerResult?.data?.buyerId || resolvedBuyerId || null,
              role: registerResult?.data?.role || profile.role || "member",
              registrationKey,
            }));
          } catch (error) {
            console.error("[PUSH] registration handler failed", JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
              registrationKey,
            }));
            scheduleRetry("registration_handler_failed");
          }
        });
        removeHandles.push(registrationHandle);

        const registrationErrorHandle = await PushNotifications.addListener("registrationError", (error) => {
          console.error("[PUSH] registrationError", JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }));
          scheduleRetry("registration_error");
        });
        removeHandles.push(registrationErrorHandle);

        const receivedHandle = await PushNotifications.addListener("pushNotificationReceived", async (notification) => {
          if (cancelled) return;
          console.log("[PUSH] pushNotificationReceived", JSON.stringify({
            nativePlatform: true,
            title: String(notification?.title || ""),
            body: String(notification?.body || ""),
            data: notification?.data || {},
          }));
          const title = String(notification?.title || "Suoraan Kalastajalta");
          const body = String(notification?.body || "");
          const data = notification?.data || {};
          const notificationKey = JSON.stringify([title, body, data?.eventType || "", data?.offerId || "", data?.batchId || ""]);
          const now = Date.now();
          if (
            foregroundNotificationRef.current.key === notificationKey &&
            now - foregroundNotificationRef.current.at < 1500
          ) {
            console.log("[PUSH] duplicate-suppressed", JSON.stringify({
              title,
              body,
              data,
            }));
            return;
          }
          foregroundNotificationRef.current = { key: notificationKey, at: now };

          setAuthInfo(body || title);
          await triggerForegroundNotificationFeedback();
          try {
            await LocalNotifications.schedule({
              notifications: [{
                id: Number(String(Date.now()).slice(-9)),
                title,
                body,
                channelId: PUSH_CHANNEL_ID,
                smallIcon: "ic_stat_fish",
                sound: PUSH_SOUND_NAME,
                extra: data,
              }],
            });
            console.log("[PUSH] LocalNotifications.schedule:ok", JSON.stringify({
              title,
              body,
              channelId: PUSH_CHANNEL_ID,
              data,
            }));
          } catch (error) {
            console.error("[PUSH] LocalNotifications.schedule:error", JSON.stringify({
              title,
              body,
              channelId: PUSH_CHANNEL_ID,
              data,
              error: error instanceof Error ? error.message : String(error),
            }));
          }
        });
        removeHandles.push(receivedHandle);

        const actionHandle = await PushNotifications.addListener("pushNotificationActionPerformed", (result) => {
          if (cancelled) return;
          console.log("[PUSH] pushNotificationActionPerformed", JSON.stringify(result?.notification?.data || {}));
          handleNotificationNavigation(result?.notification?.data || {});
        });
        removeHandles.push(actionHandle);

        const localActionHandle = await LocalNotifications.addListener("localNotificationActionPerformed", (result) => {
          if (cancelled) return;
          console.log("[PUSH] localNotificationActionPerformed", JSON.stringify(result?.notification?.extra || {}));
          handleNotificationNavigation(result?.notification?.extra || {});
        });
        removeHandles.push(localActionHandle);

        await PushNotifications.register();
      } catch (error) {
        resetRegistrationKey();
        console.error("[PUSH] setup failed", JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        }));
        scheduleRetry("setup_failed");
      }
    };

    void registerPushNotifications();

    return () => {
      cancelled = true;
      clearRetryTimeout();
      resetRegistrationKey();
      removeHandles.forEach((handle) => {
        try {
          handle.remove();
        } catch {
          // ignore cleanup failure
        }
      });
    };
  }, [handleNotificationNavigation, linkedBuyerRecord?.id, profile?.buyer_id, profile?.id, profile?.role, registerPushTokenOwnership, session?.user?.id]);

  const getMissingSellerBillingFields = (profileLike) => {
    const checks = [
      { label: "yrityksen nimi", value: profileLike?.company_name || profileLike?.companyName },
      { label: "Y-tunnus", value: profileLike?.business_id || profileLike?.businessId },
      { label: "osoite", value: profileLike?.address },
      { label: "postinumero", value: profileLike?.postcode },
      { label: "kaupunki", value: profileLike?.city },
      { label: "laskutusosoite", value: profileLike?.billing_address || profileLike?.billingAddress },
      { label: "laskutuksen postinumero", value: profileLike?.billing_postcode || profileLike?.billingPostcode },
      { label: "laskutuskaupunki", value: profileLike?.billing_city || profileLike?.billingCity },
      { label: "laskutussähköposti", value: profileLike?.billing_email || profileLike?.billingEmail },
    ];

    return checks
      .filter((item) => !String(item.value || "").trim())
      .map((item) => item.label);
  };

  const getMissingBuyerTradeFields = (buyerLike, profileLike) => {
    const checks = [
      { label: "yrityksen nimi", value: buyerLike?.company_name || profileLike?.company_name || profileLike?.companyName || profileLike?.display_name },
      { label: "Y-tunnus", value: buyerLike?.business_id || profileLike?.business_id || profileLike?.businessId },
      { label: "yhteyssähköposti", value: buyerLike?.contact_email || profileLike?.contact_email || profileLike?.contactEmail || profileLike?.email },
      { label: "puhelin", value: buyerLike?.phone || profileLike?.phone },
      { label: "toimitusosoite", value: buyerLike?.delivery_address || profileLike?.delivery_address || profileLike?.deliveryAddress || profileLike?.address },
      { label: "toimituksen postinumero", value: buyerLike?.delivery_postcode || profileLike?.delivery_postcode || profileLike?.deliveryPostcode || profileLike?.postcode },
      { label: "toimituskaupunki", value: buyerLike?.delivery_city || profileLike?.delivery_city || profileLike?.deliveryCity || profileLike?.city },
      { label: "laskutusosoite", value: buyerLike?.billing_address || profileLike?.billing_address || profileLike?.billingAddress },
      { label: "laskutuksen postinumero", value: buyerLike?.billing_postcode || profileLike?.billing_postcode || profileLike?.billingPostcode },
      { label: "laskutuskaupunki", value: buyerLike?.billing_city || profileLike?.billing_city || profileLike?.billingCity },
      { label: "laskutussähköposti", value: buyerLike?.billing_email || profileLike?.billing_email || profileLike?.billingEmail },
    ];

    return checks
      .filter((item) => !String(item.value || "").trim())
      .map((item) => item.label);
  };

  const normalizeBuyerType = (type) => {
    const normalized = String(type || "").trim().toLowerCase();
    if (normalized === "tukku") return "tukku";
    if (normalized === "kauppa") return "kauppa";
    if (normalized === "ravintola") return "ravintola";
    return "";
  };

  const parseBuyerTypes = (value) => {
    if (Array.isArray(value)) {
      return Array.from(new Set(value.map((item) => normalizeBuyerType(item)).filter(Boolean)));
    }
    return Array.from(new Set(
      String(value || "")
        .split(/[;,]/)
        .map((item) => normalizeBuyerType(item))
        .filter(Boolean),
    ));
  };

  const serializeBuyerTypes = (value) => {
    const types = parseBuyerTypes(value);
    return types.length > 0 ? types.join(",") : "ravintola";
  };

  const toggleBuyerTypeSelection = (currentValue, type, checked) => {
    const normalized = normalizeBuyerType(type);
    const currentTypes = parseBuyerTypes(currentValue);
    const nextTypes = checked
      ? Array.from(new Set([...currentTypes, normalized].filter(Boolean)))
      : currentTypes.filter((item) => item !== normalized);
    return serializeBuyerTypes(nextTypes.length > 0 ? nextTypes : ["ravintola"]);
  };

  const buyerTypeTextLabel = (type) => {
    const normalizedType = normalizeBuyerType(type);
    if (normalizedType === "ravintola") return "Ravintola";
    if (normalizedType === "tukku") return "Tukku";
    if (normalizedType === "kauppa") return "Kauppa";
    return "Ostaja";
  };

  const buyerTypesBadgeLabel = (value) => {
    const types = parseBuyerTypes(value);
    if (types.length === 0) return "Ostaja";
    return types.map((type) => buyerTypeTextLabel(type)).join(" / ");
  };

  const fishermanDeliveryMethods = deliveryMethods.filter((method) => method === "Nouto" || method === "Myyjä toimittaa");
  const normalizeFishermanDeliveryMethod = (value) => (
    fishermanDeliveryMethods.includes(value) ? value : "Nouto"
  );

  const buyerTypeLabel = (type) => {
    const types = parseBuyerTypes(type);
    if (types.length === 1) {
      const normalizedType = types[0];
      if (normalizedType === "ravintola") return "Anonyymi ravintola";
      if (normalizedType === "tukku") return "Anonyymi tukku";
      if (normalizedType === "kauppa") return "Anonyymi kauppa";
    }
    if (types.length > 1) {
      return `Anonyymi ${types.map((item) => buyerTypeTextLabel(item).toLowerCase()).join(" / ")}`;
    }
    return "Anonyymi ostaja";
  };

  const getBuyerPrivateUntilAcceptedLabel = (offer) => {
    if (shouldRevealBuyerIdentity(offer?.status)) {
      return offer?.buyer_company_name || offer?.buyer_email || "Ostaja";
    }
    return buyerTypeLabel(offer?.buyer_type);
  };

  const shouldRevealBuyerIdentity = shouldRevealBuyerIdentityForStatus;

  const getSellerIdentityForBuyer = (offer) => {
    const matchingEntry = entries.find((entry) => {
      if (offer.batch_id && entry.batchId) return offer.batch_id === entry.batchId;
      return (
        entry.ownerUserId === offer.seller_user_id &&
        entry.area === offer.area &&
        (entry.spot || "") === (offer.spot || "") &&
        Number(entry.kilos || 0) === Number(offer.total_kilos || 0)
      );
    });

    return {
      sellerName: offer.seller_company_name || offer.seller_name || offer.sellerCompanyNameFallback || offer.sellerDisplayNameFallback || matchingEntry?.ownerName || "Myyjä",
      sellerBusinessId: offer.seller_business_id || offer.sellerBusinessIdFallback || "",
      sellerAddress: formatInvoicePartyAddress(
        offer.seller_address || offer.sellerAddressFallback,
        offer.seller_postcode || offer.sellerPostcodeFallback,
        offer.seller_city || offer.sellerCityFallback,
      ),
      sellerEmail: offer.seller_contact_email || offer.seller_email || offer.sellerContactEmailFallback || offer.sellerEmail || "",
      sellerPhone: offer.seller_phone || offer.sellerPhone || "",
      sellerCommercialFishingId: offer.seller_commercial_fishing_id || offer.sellerCommercialFishingIdFallback || matchingEntry?.commercialFishingId || "",
      sellerArea: matchingEntry?.area || offer.area || "",
      municipality: matchingEntry?.municipality || "",
      sellerSpot: matchingEntry?.spot || offer.spot || "",
      deliveryMethod: matchingEntry?.deliveryMethod || offer?.delivery_method || "",
      deliveryArea: matchingEntry?.deliveryArea || offer?.delivery_area || "",
      deliveryCost: matchingEntry?.deliveryCost ?? offer?.delivery_cost ?? "",
      earliestDeliveryDate: matchingEntry?.earliestDeliveryDate || offer?.earliest_delivery_date || "",
      coldTransport: matchingEntry?.coldTransport ?? Boolean(offer?.cold_transport),
    };
  };

  const getBuyerVisibleSellerInfo = (offer) => {
    const sellerIdentity = getSellerIdentityForBuyer(offer);
    const revealIdentity = offer?.status === "accepted";

    return {
      ...sellerIdentity,
      revealIdentity,
      sellerLabel: revealIdentity ? sellerIdentity.sellerName : ANONYMOUS_SELLER_LABEL,
      publicLocation: sellerIdentity.sellerArea || offer?.area || "-",
      publicSpot: revealIdentity ? (sellerIdentity.sellerSpot || "") : "",
    };
  };

  const resolveBuyerVisibleSellerBusinessId = (offer, sellerInfo) => {
    return sellerInfo?.sellerBusinessId ||
      offer?.seller_business_id ||
      offer?.sellerBusinessIdFallback ||
      offer?.business_id ||
      "";
  };
  const getEntryReservation = (entry) => {
    const matches = (buyerOffers || []).filter((offer) => {
      if (offer.status !== "reserved" && offer.status !== "accepted") return false;
      if (offer.batch_id && entry.batchId) return offer.batch_id === entry.batchId;
      return (
        offer.seller_user_id === entry.ownerUserId &&
        offer.area === entry.area &&
        offer.spot === (entry.spot || "") &&
        Number(offer.total_kilos || 0) === Number(entry.kilos || 0)
      );
    });

    if (matches.length === 0) return null;
    return matches.sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime())[0];
  };
  const shouldSendOffer = hasFisherPremium && form.listForSale && (form.offerToShops || form.offerToRestaurants || form.offerToWholesalers);
  const shouldSendProcessedOffer = processedForm.listForSale && (processedForm.offerToShops || processedForm.offerToRestaurants || processedForm.offerToWholesalers);
  const currentOriginCity = form.originCity || form.municipality || "";
  const currentProcessedOriginCity = processedForm.originCity || processedForm.municipality || "";
  const derivedDeliveryArea = form.deliveryPossible && form.deliveryMethod === "Kuljetus järjestetään"
    ? formatDeliveryDestinations(form.deliveryDestinations)
    : form.deliveryArea;
  const derivedProcessedDeliveryArea = processedForm.deliveryPossible && processedForm.deliveryMethod === "Kuljetus järjestetään"
    ? formatDeliveryDestinations(processedForm.deliveryDestinations)
    : processedForm.deliveryArea;
  const savedPickupAddress = profile?.pickup_address || "";
  const resolvedPickupAddress = (form.pickupAddress || savedPickupAddress || "").trim();
  const resolvedProcessedPickupAddress = (processedForm.pickupAddress || savedPickupAddress || "").trim();
  const availableOriginPoints = useMemo(
    () => getAvailableOriginPoints(currentOriginCity, form.area, form.transportMode),
    [currentOriginCity, form.area, form.transportMode],
  );
  const availableProcessedOriginPoints = useMemo(
    () => getAvailableOriginPoints(currentProcessedOriginCity, processedForm.area, processedForm.transportMode),
    [currentProcessedOriginCity, processedForm.area, processedForm.transportMode],
  );
  const totalKilosForOffer = useMemo(
    () => speciesRows.reduce((sum, row) => sum + Number(row.kilos || 0), 0),
    [speciesRows],
  );
  const totalProcessedKilosForOffer = Number(processedForm.kilos || 0);
  const availableRouteOptions = useMemo(
    () => (form.originPointId ? getRouteOptionsForPoint(form.originPointId, totalKilosForOffer) : []),
    [form.originPointId, totalKilosForOffer],
  );
  const availableProcessedRouteOptions = useMemo(
    () => (processedForm.originPointId ? getRouteOptionsForPoint(processedForm.originPointId, totalProcessedKilosForOffer) : []),
    [processedForm.originPointId, totalProcessedKilosForOffer],
  );
  const suggestedDeliveryCities = useMemo(
    () => getSuggestedDestinationCities(currentOriginCity, form.area),
    [currentOriginCity, form.area],
  );
  const suggestedProcessedDeliveryCities = useMemo(
    () => getSuggestedDestinationCities(currentProcessedOriginCity, processedForm.area),
    [currentProcessedOriginCity, processedForm.area],
  );
  const availableDestinationCities = useMemo(
    () => Array.from(new Set([
      ...alwaysSuggestedDestinationCities,
      ...availableRouteOptions.map((item) => item.destination_city),
      ...(Array.isArray(form.deliveryDestinations) ? form.deliveryDestinations : []),
    ])).filter(Boolean),
    [availableRouteOptions, form.deliveryDestinations],
  );
  const availableProcessedDestinationCities = useMemo(
    () => Array.from(new Set([
      ...alwaysSuggestedDestinationCities,
      ...availableProcessedRouteOptions.map((item) => item.destination_city),
      ...(Array.isArray(processedForm.deliveryDestinations) ? processedForm.deliveryDestinations : []),
    ])).filter(Boolean),
    [availableProcessedRouteOptions, processedForm.deliveryDestinations],
  );
  const selectedOriginPoint = useMemo(
    () => availableOriginPoints.find((point) => point.id === form.originPointId) || null,
    [availableOriginPoints, form.originPointId],
  );
  const selectedProcessedOriginPoint = useMemo(
    () => availableProcessedOriginPoints.find((point) => point.id === processedForm.originPointId) || null,
    [availableProcessedOriginPoints, processedForm.originPointId],
  );

  useEffect(() => {
    if (!profile?.id || !profile?.role || !profile?.is_active) {
      setOnboardingGuideState((prev) => ({ ...prev, visible: false }));
      return;
    }

    const storedGuideState = getStoredOnboardingGuideState(profile);
    if (storedGuideState.hiddenForever || storedGuideState.views >= ONBOARDING_GUIDE_MAX_VIEWS) {
      setOnboardingGuideState({
        views: storedGuideState.views,
        hiddenForever: storedGuideState.hiddenForever,
        visible: false,
      });
      return;
    }

    const nextViews = storedGuideState.hiddenForever
      ? storedGuideState.views
      : storedGuideState.views + 1;
    const nextGuideState = {
      views: nextViews,
      hiddenForever: storedGuideState.hiddenForever,
      visible: !storedGuideState.hiddenForever && nextViews <= ONBOARDING_GUIDE_MAX_VIEWS,
    };

    if (!storedGuideState.hiddenForever) {
      saveStoredOnboardingGuideState(profile, nextGuideState);
    }

    setOnboardingGuideState(nextGuideState);
  }, [profile?.id, profile?.role, profile?.is_active]);

  const dismissOnboardingGuideNow = useCallback(() => {
    setOnboardingGuideState((prev) => ({ ...prev, visible: false }));
  }, []);

  const hideOnboardingGuideForever = useCallback(() => {
    if (profile?.id && profile?.role) {
      saveStoredOnboardingGuideState(profile, { ...onboardingGuideState, hiddenForever: true, visible: false });
    }
    setOnboardingGuideState((prev) => ({ ...prev, hiddenForever: true, visible: false }));
  }, [onboardingGuideState, profile]);

  const analyzeOfferRecipients = (offerFormState, rows) => {
    const totalKilos = rows.reduce((sum, row) => sum + Number(row.kilos || 0), 0);
    const productTotal = getOfferProductTotal(rows);
    const selectedTypes = [];
    if (offerFormState.offerToShops) selectedTypes.push(normalizeBuyerType("kauppa"));
    if (offerFormState.offerToRestaurants) selectedTypes.push(normalizeBuyerType("ravintola"));
    if (offerFormState.offerToWholesalers) selectedTypes.push(normalizeBuyerType("tukku"));

    const matching = [];
    const excluded = [];

    (buyers || [])
      .filter((buyer) => buyer.is_active)
      .forEach((buyer) => {
        const buyerTypes = parseBuyerTypes(buyer.buyer_type);
        const matchedBuyerType = buyerTypes.find((buyerType) => selectedTypes.includes(buyerType));
        if (!matchedBuyerType) return;
        const minKg = getOptionalKgLimit(buyer.min_kg);
        const maxKg = getOptionalKgLimit(buyer.max_kg);
        const minOk = minKg == null || totalKilos >= minKg;
        const maxOk = maxKg == null || totalKilos <= maxKg;
        const recipient = {
          buyer_id: buyer.id,
          email: buyer.email,
          channel: matchedBuyerType,
          company_name: buyer.company_name,
          contact_name: buyer.contact_name,
          destination_city: resolveBuyerDestinationCity(buyer),
        };

        if (!minOk || !maxOk) {
          excluded.push({
            ...recipient,
            minKg,
            maxKg,
            reason: !minOk
              ? `erä ${totalKilos.toFixed(1)} kg on pienempi kuin ostajan minimi ${Number(minKg || 0).toFixed(1)} kg`
              : `erä ${totalKilos.toFixed(1)} kg ylittää ostajan maksimin ${Number(maxKg || 0).toFixed(1)} kg`,
          });
          return;
        }

        if (offerFormState.deliveryPossible && offerFormState.deliveryMethod === "Kuljetus järjestetään") {
          const buyerCity = resolveBuyerDestinationCity(buyer);
          if (!buyerCity) {
            excluded.push({
              ...recipient,
              reason: "ostajan toimituskaupunki puuttuu",
            });
            return;
          }

          const allowedDestinations = Array.isArray(offerFormState.deliveryDestinations) ? offerFormState.deliveryDestinations : [];
          if (!allowedDestinations.includes(buyerCity)) {
            excluded.push({
              ...recipient,
              reason: `kohde ${buyerCity} ei kuulu valittuihin toimituskohteisiin`,
            });
            return;
          }

          const routePrice = getRoutePrice(offerFormState.originPointId, buyerCity, totalKilos);
          if (!routePrice) {
            excluded.push({
              ...recipient,
              reason: `reittihintaa ei löydy kohteeseen ${buyerCity}`,
            });
            return;
          }

          matching.push({
            ...recipient,
            route_price_eur: Number(routePrice.price_eur || 0),
            total_price_eur: productTotal + Number(routePrice.price_eur || 0),
            delivered_price_per_kg: totalKilos > 0 ? (productTotal + Number(routePrice.price_eur || 0)) / totalKilos : "",
            cutoff_time: routePrice.cutoff_time || "",
            carrier_id: routePrice.carrier_id || "",
            carrier_name: routePrice.carrier_name || "",
          });
          return;
        }

        matching.push(recipient);
      });

    const dedupedMatching = matching.filter((recipient, index, array) => {
      const recipientKey = String(recipient.buyer_id || "").trim()
        || (recipient.email || "").trim().toLowerCase()
        || `${recipient.company_name || ""}::${recipient.channel || ""}`;
      return index === array.findIndex((item) => {
        const itemKey = String(item.buyer_id || "").trim()
          || (item.email || "").trim().toLowerCase()
          || `${item.company_name || ""}::${item.channel || ""}`;
        return itemKey === recipientKey;
      });
    });
    return {
      totalKilos,
      selectedTypes,
      matching: dedupedMatching,
      excluded,
    };
  };

  const buildOfferRecipients = (offerFormState, rows) => {
    return analyzeOfferRecipients(offerFormState, rows).matching;
  };

  const invalidateSession = async (message = "Istunto on vanhentunut. Kirjaudu uudelleen sisään.") => {
    await clearBrokenSession();
    setSession(null);
    setProfile(null);
    setAvailableRoleOptions([]);
    setRoleSelectionOpen(false);
    setEntries([]);
      setProcessedEntries([]);
      setOffers([]);
      setAllowedUsers([]);
    setAuthMode("signin");
    setAuthInfo("");
    setAuthError(message);
  };

  useEffect(() => {
    runLocalTests();

    const init = async () => {
      try {
        const { data, error } = await getSessionWithTimeout(isNativeCapacitorApp() ? 6000 : 5000);
        if (error) {
          if (isMissingRefreshTokenError(error)) {
            await invalidateSession();
            setLoading(false);
            return;
          }
          setAuthError(error.message);
        }
        setSession(data?.session ?? null);
      } catch (error) {
        if (isMissingRefreshTokenError(error)) {
          await invalidateSession();
        } else if (String(error?.message || error) === "SESSION_INIT_TIMEOUT") {
          await clearBrokenSession();
          setSession(null);
          setAuthError("Android-istunnon avaus kesti liian kauan. Sovellus siirtyi kirjautumisnäkymään, jotta voit jatkaa normaalisti.");
        } else {
          setAuthError(String(error?.message || error));
        }
      } finally {
        setLoading(false);
      }
    };
    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (event === "TOKEN_REFRESH_FAILED") {
        await invalidateSession();
        return;
      }
      if (event === "PASSWORD_RECOVERY") {
        setAuthMode("recovery");
        setAuthError("");
        setAuthInfo("Aseta uusi salasana jatkaaksesi.");
        setAuthForm((prev) => ({
          ...prev,
          email: (nextSession?.user?.email || prev.email || "").trim().toLowerCase(),
          password: "",
          confirmPassword: "",
        }));
      }
      setSession(nextSession ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!loading) {
      setSlowBoot(false);
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setSlowBoot(true);
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const linkedOffer = params.get("offer");
    if (linkedOffer) {
      setBuyerActiveOfferId(linkedOffer);
      setActiveTab("offers");
    }
  }, []);

  useEffect(() => {
    if (!requestedOfferId || profile?.role !== "buyer" || buyerOffers.length === 0) return;
    const linkedOffer = buyerOffers.find((offer) => offer.id === requestedOfferId);
    if (!linkedOffer) return;

    setBuyerActiveOfferId(linkedOffer.id);

    setBuyerOffersFilter(getBuyerOffersFilterForStatus(linkedOffer.status));
  }, [requestedOfferId, profile?.role, buyerOffers]);

  useEffect(() => {
    if (!publicBatchId) {
      setPublicBatchData(null);
      setPublicBatchLoading(false);
      setPublicBatchError("");
      return;
    }

    let cancelled = false;

    const loadPublicBatch = async () => {
      setPublicBatchLoading(true);
      setPublicBatchError("");

      try {
        const response = await fetch(getPublicBatchInfoUrl(publicBatchId));
        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(result?.error || `Erän tietoja ei voitu hakea (HTTP ${response.status}).`);
        }

        if (!cancelled) {
          setPublicBatchData(result);
        }
      } catch (error) {
        if (!cancelled) {
          setPublicBatchData(null);
          setPublicBatchError(String(error?.message || error || "Erän tietoja ei voitu hakea."));
        }
      } finally {
        if (!cancelled) {
          setPublicBatchLoading(false);
        }
      }
    };

    loadPublicBatch();
    return () => {
      cancelled = true;
    };
  }, [publicBatchId]);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      setAvailableRoleOptions([]);
      setRoleSelectionOpen(false);
      setEntries([]);
      setProcessedEntries([]);
      setOffers([]);
      setAllowedUsers([]);
      setPendingProfiles([]);
      return;
    }

    const ensureProfile = async () => {
      const email = (session.user.email || "").trim().toLowerCase();
      const { data: allowedRows, error: allowedError } = await findAllowedUsersByEmail(supabase, email);
      if (allowedError && allowedError.code !== "PGRST116") {
        if (isMissingRefreshTokenError(allowedError)) {
          await invalidateSession();
          return;
        }
        setAuthError(allowedError.message);
        return;
      }
      let effectiveAllowedRows = allowedRows || [];
      let activeAllowedRows = effectiveAllowedRows.filter((row) => row.is_active);

      const ensureAutoAllowedUserRow = async (profileRow) => {
        if (!profileRow || !isRoleAutomaticallyActive(profileRow.role)) {
          return;
        }
        const normalizedProfileEmail = normalizeEmail(profileRow.email || email || "");
        if (!normalizedProfileEmail) return;

        const allowedPayload = {
          email: normalizedProfileEmail,
          display_name: profileRow.display_name || session.user.user_metadata?.display_name || normalizedProfileEmail,
          role: profileRow.role || "member",
          is_active: true,
          buyer_id: profileRow.role === "buyer" ? profileRow.buyer_id || null : null,
        };

        const exactRoleRow = effectiveAllowedRows.find((row) => (
          normalizeEmail(row.email) === normalizedProfileEmail &&
          row.role === allowedPayload.role &&
          String(row.buyer_id || "") === String(allowedPayload.buyer_id || "")
        )) || null;

        const needsUpdate = exactRoleRow && (
          !exactRoleRow.is_active ||
          String(exactRoleRow.display_name || "") !== String(allowedPayload.display_name || "")
        );

        const { data: ensuredRow, error: ensureAllowedError } = exactRoleRow
          ? (needsUpdate
            ? await supabase.from("allowed_users").update(allowedPayload).eq("id", exactRoleRow.id).select("*").single()
            : { data: exactRoleRow, error: null })
          : await supabase.from("allowed_users").insert(allowedPayload).select("*").single();

        if (ensureAllowedError) {
          if (isMissingRefreshTokenError(ensureAllowedError)) {
            await invalidateSession();
            return;
          }
          setAuthError(ensureAllowedError.message);
          return;
        }

        if (ensuredRow) {
          effectiveAllowedRows = exactRoleRow
            ? effectiveAllowedRows.map((row) => (row.id === ensuredRow.id ? ensuredRow : row))
            : [...effectiveAllowedRows, ensuredRow];
          activeAllowedRows = effectiveAllowedRows.filter((row) => row.is_active);
        }
      };

      const { data: existingProfile, error: profileError } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
      if (profileError && profileError.code !== "PGRST116") {
        if (isMissingRefreshTokenError(profileError)) {
          await invalidateSession();
          return;
        }
        setAuthError(profileError.message);
        return;
      }
      if (existingProfile) {
        let profileToUse = existingProfile;
        if (!existingProfile.is_active && activeAllowedRows.length === 0 && isRoleAutomaticallyActive(existingProfile.role)) {
          const { data: autoActivatedProfile, error: autoActivateError } = await supabase
            .from("profiles")
            .update({ is_active: true })
            .eq("id", session.user.id)
            .select("*")
            .single();
          if (!autoActivateError && autoActivatedProfile) {
            profileToUse = autoActivatedProfile;
          }
        }
        await ensureAutoAllowedUserRow(profileToUse);
        const matchingAllowedRole = getMatchingAllowedRole(activeAllowedRows, existingProfile);
        const selectedAllowedRole = matchingAllowedRole || (activeAllowedRows.length === 1 ? activeAllowedRows[0] : null);
        if (!selectedAllowedRole) {
          const normalizedProfile = {
            ...profileToUse,
            email: (profileToUse.email || email || "").trim().toLowerCase(),
            is_active: Boolean(profileToUse.is_active || isRoleAutomaticallyActive(profileToUse.role) || activeAllowedRows.some((row) => row.is_active)),
          };
          setProfile(normalizedProfile);
          setAvailableRoleOptions(activeAllowedRows);
          setRoleSelectionOpen(activeAllowedRows.length > 1);
          if (activeAllowedRows.length === 0 && !normalizedProfile.is_active) {
            setAuthInfo("Tunnus odottaa ylläpitäjän hyväksyntää.");
          }
          return;
        }
        if (
          existingProfile.role !== selectedAllowedRole.role ||
          String(existingProfile.buyer_id || "") !== String(selectedAllowedRole.buyer_id || "")
        ) {
          const { data: updatedProfile, error: updateProfileError } = await supabase
            .from("profiles")
            .update({
              role: selectedAllowedRole.role || "member",
              buyer_id: selectedAllowedRole.buyer_id || null,
              is_active: selectedAllowedRole.is_active,
            })
            .eq("id", session.user.id)
            .select("*")
            .single();
          if (!updateProfileError && updatedProfile) {
            profileToUse = updatedProfile;
          }
        }
        const normalizedProfile = {
          ...profileToUse,
          email: (profileToUse.email || email || "").trim().toLowerCase(),
        };
        setProfile(normalizedProfile);
        setAvailableRoleOptions(activeAllowedRows);
        setRoleSelectionOpen(activeAllowedRows.length > 1 && !matchingAllowedRole);
        fisherInfoSyncingRef.current = true;
        setFisherInfoForm({
          commercialFishingId: profileToUse.commercial_fishing_id || "",
          commercialFishingVesselId: profileToUse.commercial_fishing_vessel_id || "",
          commercialFishingVesselIdsText: getCommercialFishingVesselIds(profileToUse).join("\n"),
          eviraFacilityId: profileToUse.evira_facility_id || "",
        });
        setFisherInfoDirty(false);
        return;
      }
      const defaultAllowedRole = activeAllowedRows[0] || null;
      const requestedRole = session.user.user_metadata?.requested_role === "buyer"
        ? "buyer"
        : session.user.user_metadata?.requested_role === "processor"
          ? "processor"
          : "member";
      const autoActiveRole = isRoleAutomaticallyActive(defaultAllowedRole?.role || requestedRole);
      const { data: insertedProfile, error: insertError } = await supabase
        .from("profiles")
        .insert({
          id: session.user.id,
          email,
          display_name: defaultAllowedRole?.display_name || session.user.user_metadata?.display_name || email,
          role: defaultAllowedRole?.role || requestedRole,
          is_active: defaultAllowedRole?.is_active || autoActiveRole,
          buyer_id: defaultAllowedRole?.buyer_id || null,
        })
        .select("*")
        .single();
      if (insertError) {
        if (isMissingRefreshTokenError(insertError)) {
          await invalidateSession();
          return;
        }
        setAuthError(insertError.message);
        return;
      }
      await ensureAutoAllowedUserRow(insertedProfile);
      const normalizedInsertedProfile = {
        ...insertedProfile,
        email: (insertedProfile.email || email || "").trim().toLowerCase(),
      };
      setProfile(normalizedInsertedProfile);
      setAvailableRoleOptions(activeAllowedRows);
      setRoleSelectionOpen(false);
      if (!defaultAllowedRole && !autoActiveRole) {
        setAuthInfo("Tunnus odottaa ylläpitäjän hyväksyntää.");
        await notifyOwnersAboutPendingApproval(insertedProfile);
      } else if (autoActiveRole) {
        setAuthInfo("Tunnus luotu. Voit käyttää appia heti ja täydentää omat tiedot ennen kaupallisia toimintoja.");
      }
      fisherInfoSyncingRef.current = true;
      setFisherInfoForm({
        commercialFishingId: insertedProfile.commercial_fishing_id || "",
        commercialFishingVesselId: insertedProfile.commercial_fishing_vessel_id || "",
        commercialFishingVesselIdsText: getCommercialFishingVesselIds(insertedProfile).join("\n"),
        eviraFacilityId: insertedProfile.evira_facility_id || "",
      });
      setFisherInfoDirty(false);
    };

    ensureProfile();
  }, [session]);

  useEffect(() => {
    if (!profile) return;

    let cancelled = false;

    const verifyActiveProfileStillExists = async () => {
      if (!session?.user?.id) return;

      const { data: currentProfile, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", session.user.id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        if (isMissingRefreshTokenError(error)) {
          await invalidateSession();
          return;
        }
        console.warn("profile existence check failed", error);
        return;
      }

      if (!currentProfile) {
        await invalidateSession("Käyttäjätili on poistettu. Kirjaudu uudelleen vain, jos ylläpitäjä on lisännyt sinut takaisin.");
      }
    };

    verifyActiveProfileStillExists();

    const intervalId = window.setInterval(() => {
      verifyActiveProfileStillExists();
    }, 15000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        verifyActiveProfileStillExists();
      }
    };

    const handleWindowFocus = () => {
      verifyActiveProfileStillExists();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [profile?.id, session?.user?.id]);

  useEffect(() => {
    if (!profile) return;

    const loadData = async () => {
      setAuthError("");

      const entriesQuery = supabase.from("catch_entries").select("*").order("date", { ascending: false }).order("created_at", { ascending: false });
      const finalEntriesQuery = profile.role === "owner" && entryScope === "all" ? entriesQuery : entriesQuery.eq("owner_user_id", profile.id);

      try {
        const [
          hasOffersTable,
          hasBuyersTable,
          hasProcessedBatchesTable,
          hasProcessedProductsTable,
          hasProcessedBatchSourcesTable,
          hasBuyerOffersTable,
          hasAppPushTokensTable,
        ] = await Promise.all([
          tableExists(supabase, "wholesale_offers"),
          tableExists(supabase, "buyers"),
          tableExists(supabase, "processed_batches"),
          tableExists(supabase, "processed_products"),
          tableExists(supabase, "processed_batch_sources"),
          tableExists(supabase, "buyer_offers"),
          tableExists(supabase, "app_push_tokens"),
        ]);

        const buyerOffersPromise = hasBuyerOffersTable
          ? profile.role === "buyer"
            ? (() => {
                const query = supabase
                  .from("buyer_offers")
                  .select("*")
                  .in("status", BUYER_OFFER_QUERYABLE_STATUSES)
                  .order("created_at", { ascending: false });
                return buyerOfferIdentityFilters.length > 0
                  ? query.or(buyerOfferIdentityFilters.join(","))
                  : query.eq("buyer_email", normalizeEmail(profile.email));
              })()
            : supabase
                .from("buyer_offers")
                .select("*")
                .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null });
        const processorAcceptedOffersPromise = hasBuyerOffersTable && profile.role === "processor"
          ? supabase
              .from("buyer_offers")
              .select("id, batch_id, species_summary, buyer_email, status")
              .eq("buyer_email", normalizeEmail(profile.email))
              .eq("status", "accepted")
              .order("updated_at", { ascending: false })
          : Promise.resolve({ data: [], error: null });

        const [
          { data: entryData, error: entryError },
          processedEntriesResult,
          processedProductsResult,
          { data: allowedData, error: allowedError },
          ownerProfilesResult,
          appPushTokensResult,
          offerResult,
          buyersResult,
          buyerOffersResult,
          processorAcceptedOffersResult,
        ] = await Promise.all([
          finalEntriesQuery,
          hasProcessedBatchesTable
            ? ((profile.role === "owner" && entryScope === "all")
              ? supabase.from("processed_batches").select("*").order("production_date", { ascending: false }).order("created_at", { ascending: false })
              : supabase.from("processed_batches").select("*").eq("owner_user_id", profile.id).order("production_date", { ascending: false }).order("created_at", { ascending: false }))
            : Promise.resolve({ data: [], error: null }),
          hasProcessedProductsTable && profile.role === "processor"
            ? supabase.from("processed_products").select("*").eq("owner_user_id", profile.id).order("template_name", { ascending: true }).order("created_at", { ascending: false })
            : Promise.resolve({ data: [], error: null }),
          profile.role === "owner"
            ? supabase.from("allowed_users").select("*").order("created_at", { ascending: true })
            : Promise.resolve({ data: [], error: null }),
          profile.role === "owner"
            ? supabase.from("profiles").select("*").order("created_at", { ascending: false })
            : Promise.resolve({ data: [], error: null }),
          profile.role === "owner" && hasAppPushTokensTable
            ? supabase
                .from("app_push_tokens")
                .select("id, user_id, buyer_id, role, platform, device_label, is_active, last_seen_at, created_at, updated_at")
                .order("last_seen_at", { ascending: false })
            : Promise.resolve({ data: [], error: null }),
          hasOffersTable
            ? (profile.role === "owner"
              ? supabase.from("wholesale_offers").select("*").order("created_at", { ascending: false })
              : supabase.from("wholesale_offers").select("*").eq("created_by_user_id", profile.id).order("created_at", { ascending: false }))
            : Promise.resolve({ data: [], error: null }),
          hasBuyersTable
            ? (profile.role === "owner"
              ? supabase.from("buyers").select("*").order("company_name", { ascending: true })
              : profile.role === "buyer"
                ? (() => {
                    const query = supabase.from("buyers").select("*").order("company_name", { ascending: true });
                    const buyerLookupFilters = Array.from(new Set([
                      ...buyerOfferIdentityFilters
                        .filter((clause) => clause.startsWith("buyer_id.eq."))
                        .map((clause) => clause.replace("buyer_id.eq.", "id.eq.")),
                      ...buyerIdentityEmails.map((email) => `email.eq.${email}`),
                      ...buyerIdentityEmails.map((email) => `billing_email.eq.${email}`),
                    ]));
                    return buyerLookupFilters.length > 0
                      ? query.or(buyerLookupFilters.join(","))
                      : query.eq("email", normalizeEmail(profile.email));
                  })()
                : supabase.from("buyers").select("*").eq("is_active", true).order("company_name", { ascending: true }))
            : Promise.resolve({ data: [], error: null }),
          buyerOffersPromise,
          processorAcceptedOffersPromise,
        ]);

        if (entryError) {
          if (isMissingRefreshTokenError(entryError)) {
            await invalidateSession();
            return;
          }
          setAuthError(entryError.message);
        } else {
          setEntries((entryData || []).map((entry) => ({
            ...extractCatchLogisticsDetailsFromNotes(entry.notes),
            ...extractCatchGearDetailsFromNotes(entry.notes),
            id: entry.id,
            batchId: entry.batch_id,
            date: entry.date,
            createdAt: entry.created_at || "",
            area: entry.area,
            municipality: entry.municipality || "",
            originCity: entry.origin_city || entry.municipality || "",
            spot: entry.spot || "",
            species: entry.species,
            waterType: entry.water_type || "",
            kilos: Number(entry.kilos || 0),
            count: Number(entry.count || 0),
            gear: entry.gear,
            notes: entry.notes || "",
            deliveryMethod: entry.delivery_method || "Nouto",
            deliveryPossible: Boolean(entry.delivery_possible),
            transportMode: entry.transport_mode || "",
            originPointId: entry.origin_point_id || "",
            transportCompanyId: entry.transport_company_id || "",
            pickupAddress: entry.pickup_address || "",
            deliveryDestinations: Array.isArray(entry.delivery_destinations) ? entry.delivery_destinations : [],
            deliveryArea: entry.delivery_area || "",
            deliveryCost: entry.delivery_cost == null ? "" : Number(entry.delivery_cost),
            earliestDeliveryDate: entry.earliest_delivery_date || "",
            coldTransport: Boolean(entry.cold_transport),
            ownerName: entry.owner_name,
            commercialFishingId: entry.commercial_fishing_id || "",
            commercialFishingVesselId: entry.commercial_fishing_vessel_id || "",
            pricePerKg: entry.price_per_kg == null ? "" : Number(entry.price_per_kg),
            ownerUserId: entry.owner_user_id,
            offerToShops: Boolean(entry.offer_to_shops),
            offerToRestaurants: Boolean(entry.offer_to_restaurants),
            offerToWholesalers: Boolean(entry.offer_to_wholesalers),
          })));
        }

        if (processorAcceptedOffersResult?.error && processorAcceptedOffersResult.error.code !== "PGRST116") {
          if (isMissingRefreshTokenError(processorAcceptedOffersResult.error)) {
            await invalidateSession();
            return;
          }
          setAuthError(processorAcceptedOffersResult.error.message);
          setProcessorSourceEntries([]);
        } else if (profile.role === "processor") {
          const purchasedBatchIds = Array.from(new Set(
            (processorAcceptedOffersResult?.data || [])
              .flatMap((offer) => {
                const summaryBatchIds = getOfferSummaryBatchItems(offer.species_summary)
                  .map((item) => item.batchId)
                  .filter(Boolean);
                const directBatchId = String(offer.batch_id || "").trim();
                return directBatchId ? [directBatchId, ...summaryBatchIds] : summaryBatchIds;
              })
              .filter(Boolean),
          ));

          if (purchasedBatchIds.length === 0) {
            setProcessorSourceEntries([]);
          } else {
            const { data: purchasedEntriesData, error: purchasedEntriesError } = await supabase
              .from("catch_entries")
              .select("*")
              .in("batch_id", purchasedBatchIds)
              .order("date", { ascending: false })
              .order("created_at", { ascending: false });

            if (purchasedEntriesError && purchasedEntriesError.code !== "PGRST116") {
              if (isMissingRefreshTokenError(purchasedEntriesError)) {
                await invalidateSession();
                return;
              }
              setAuthError(purchasedEntriesError.message);
              setProcessorSourceEntries([]);
            } else {
              setProcessorSourceEntries((purchasedEntriesData || []).map((entry) => ({
                ...extractCatchLogisticsDetailsFromNotes(entry.notes),
                id: entry.id,
                batchId: entry.batch_id,
                date: entry.date,
                createdAt: entry.created_at || "",
                area: entry.area,
                municipality: entry.municipality || "",
                spot: entry.spot || "",
                species: entry.species,
                waterType: entry.water_type || "",
                kilos: Number(entry.kilos || 0),
                count: Number(entry.count || 0),
                gear: entry.gear,
                notes: entry.notes || "",
                deliveryMethod: entry.delivery_method || "Nouto",
                deliveryArea: entry.delivery_area || "",
                deliveryCost: entry.delivery_cost == null ? "" : Number(entry.delivery_cost),
                earliestDeliveryDate: entry.earliest_delivery_date || "",
                coldTransport: Boolean(entry.cold_transport),
                ownerName: entry.owner_name,
                commercialFishingId: entry.commercial_fishing_id || "",
                commercialFishingVesselId: entry.commercial_fishing_vessel_id || "",
                pricePerKg: entry.price_per_kg == null ? "" : Number(entry.price_per_kg),
                ownerUserId: entry.owner_user_id,
                offerToShops: Boolean(entry.offer_to_shops),
                offerToRestaurants: Boolean(entry.offer_to_restaurants),
                offerToWholesalers: Boolean(entry.offer_to_wholesalers),
              })));
            }
          }
        } else {
          setProcessorSourceEntries([]);
        }

        if (processedEntriesResult?.error && processedEntriesResult.error.code !== "PGRST116") {
          if (isMissingRefreshTokenError(processedEntriesResult.error)) {
            await invalidateSession();
            return;
          }
          setAuthError(processedEntriesResult.error.message);
        } else {
          let processedSourceRows = [];
          if (hasProcessedBatchSourcesTable && (processedEntriesResult?.data || []).length > 0) {
            const processedIds = (processedEntriesResult?.data || []).map((entry) => entry.id).filter(Boolean);
            if (processedIds.length > 0) {
              const { data: sourceData, error: sourceError } = await supabase
                .from("processed_batch_sources")
                .select("*")
                .in("processed_batch_id", processedIds)
                .order("created_at", { ascending: true });
              if (sourceError && sourceError.code !== "PGRST116") {
                if (isMissingRefreshTokenError(sourceError)) {
                  await invalidateSession();
                  return;
                }
                setAuthError(sourceError.message);
              } else {
                processedSourceRows = sourceData || [];
              }
            }
          }

          setProcessedEntries((processedEntriesResult?.data || []).map((entry) => ({
            id: entry.id,
            batchId: entry.batch_id,
            productionDate: entry.production_date,
            bestBeforeDate: entry.best_before_date || "",
            useByDate: entry.use_by_date || "",
            area: entry.area,
            municipality: entry.municipality || "",
            originCity: entry.origin_city || entry.municipality || "",
            spot: entry.spot || "",
            productName: entry.product_name || "",
            productType: entry.product_type || "",
            processingMethod: entry.processing_method || "",
            productState: entry.product_state || "",
            speciesNameFi: entry.species_name_fi || "",
            speciesNameScientific: entry.species_name_scientific || "",
            gearType: entry.gear_type || "",
            speciesSummary: entry.species_summary || "",
            ingredients: entry.ingredients || "",
            allergens: entry.allergens || "",
            storageTemperature: entry.storage_temperature || "",
            storageInstructions: entry.storage_instructions || "",
            recipeItems: Array.isArray(entry.recipe_items) ? entry.recipe_items : [],
            nutritionPer100g: entry.nutrition_per_100g || null,
            kilos: Number(entry.kilos || 0),
            packageSizeG: entry.package_size_g == null ? "" : Number(entry.package_size_g),
            packageCount: entry.package_count == null ? "" : Number(entry.package_count),
            notes: entry.notes || "",
            deliveryPossible: Boolean(entry.delivery_possible),
            deliveryMethod: entry.delivery_method || "Nouto",
            transportMode: entry.transport_mode || "",
            originPointId: entry.origin_point_id || "",
            transportCompanyId: entry.transport_company_id || "",
            pickupAddress: entry.pickup_address || "",
            deliveryDestinations: Array.isArray(entry.delivery_destinations) ? entry.delivery_destinations : [],
            deliveryArea: entry.delivery_area || "",
            deliveryCost: entry.delivery_cost == null ? "" : Number(entry.delivery_cost),
            earliestDeliveryDate: entry.earliest_delivery_date || "",
            coldTransport: Boolean(entry.cold_transport),
            ownerName: entry.owner_name,
            commercialFishingId: entry.commercial_fishing_id || "",
            ownerUserId: entry.owner_user_id,
            offerToShops: Boolean(entry.offer_to_shops),
            offerToRestaurants: Boolean(entry.offer_to_restaurants),
            offerToWholesalers: Boolean(entry.offer_to_wholesalers),
            kind: "processed",
            sourceBatches: processedSourceRows
              .filter((source) => source.processed_batch_id === entry.id)
              .map((source) => ({
                sourceEntryId: source.source_entry_id,
                batchId: source.source_batch_id,
                species: source.source_species || "",
                kilos: source.source_kilos == null ? "" : Number(source.source_kilos),
                qrImageUrl: getBatchQrImageUrl(source.source_batch_id),
              })),
          })));
        }

        if (processedProductsResult?.error && processedProductsResult.error.code !== "PGRST116") {
          if (isMissingRefreshTokenError(processedProductsResult.error)) {
            await invalidateSession();
            return;
          }
          setAuthError(processedProductsResult.error.message);
          setProcessedProducts([]);
        } else {
          setProcessedProducts((processedProductsResult?.data || []).map((item) => ({
            id: item.id,
            templateName: item.template_name || item.product_name || "Oma tuote",
            area: item.area || "Saimaa",
            municipality: item.municipality || "",
            originCity: item.origin_city || item.municipality || "",
            spot: item.spot || "",
            productName: item.product_name || "",
            productType: item.product_type || "Filee",
            processingMethod: item.processing_method || "Fileointi",
            productState: item.product_state || "",
            speciesNameFi: item.species_name_fi || "",
            speciesNameScientific: item.species_name_scientific || "",
            gearType: item.gear_type || "",
            speciesSummary: item.species_summary || "",
            ingredients: item.ingredients || "",
            allergens: item.allergens || "",
            storageTemperature: item.storage_temperature || "",
            storageInstructions: item.storage_instructions || "",
            recipeItems: Array.isArray(item.recipe_items) ? item.recipe_items : [],
            nutritionPer100g: item.nutrition_per_100g || null,
            packageSizeG: item.package_size_g == null ? "" : Number(item.package_size_g),
            notes: item.notes || "",
          })));
        }

        if (allowedError) {
          if (isMissingRefreshTokenError(allowedError)) {
            await invalidateSession();
            return;
          }
          setAuthError(allowedError.message);
        } else {
          const ownerProfilesData = ownerProfilesResult?.data || [];
          let resolvedAllowedUsers = allowedData || [];

          if (profile.role === "owner") {
            const missingAllowedPayloads = ownerProfilesData
              .filter((row) => row?.is_active && row?.email && row?.role)
              .filter((row) => !resolvedAllowedUsers.some((allowedRow) => (
                normalizeEmail(allowedRow.email) === normalizeEmail(row.email) &&
                String(allowedRow.role || "") === String(row.role || "") &&
                String(allowedRow.buyer_id || "") === String((row.role === "buyer" ? row.buyer_id : null) || "")
              )))
              .map((row) => ({
                email: normalizeEmail(row.email),
                display_name: row.display_name || normalizeEmail(row.email),
                role: row.role,
                is_active: true,
                buyer_id: row.role === "buyer" ? row.buyer_id || null : null,
              }));

            if (missingAllowedPayloads.length > 0) {
              const { data: insertedAllowedRows, error: insertAllowedError } = await supabase
                .from("allowed_users")
                .insert(missingAllowedPayloads)
                .select("*");

              if (insertAllowedError) {
                if (isMissingRefreshTokenError(insertAllowedError)) {
                  await invalidateSession();
                  return;
                }
                setAuthError(insertAllowedError.message);
              } else if (Array.isArray(insertedAllowedRows) && insertedAllowedRows.length > 0) {
                resolvedAllowedUsers = [...resolvedAllowedUsers, ...insertedAllowedRows];
              }
            }
          }

          setAllowedUsers(resolvedAllowedUsers);
          setPendingProfiles(ownerProfilesData.filter((row) => !row.is_active && row.id !== profile.id));
          setOwnerUserProfiles(ownerProfilesData.filter((row) => row.is_active));
        }

        if (appPushTokensResult?.error && appPushTokensResult.error.code !== "PGRST116") {
          if (isMissingRefreshTokenError(appPushTokensResult.error)) {
            await invalidateSession();
            return;
          }
          setAuthError(appPushTokensResult.error.message);
          setAppPushTokens([]);
        } else {
          setAppPushTokens(appPushTokensResult?.data || []);
        }

        if (offerResult?.error && offerResult.error.code !== "PGRST116") {
          if (isMissingRefreshTokenError(offerResult.error)) {
            await invalidateSession();
            return;
          }
          setAuthError(offerResult.error.message);
        } else {
          setOffers((offerResult?.data || []).map((offer) => ({
            ...offer,
            offer_price_per_kg: Number(offer.offer_price_per_kg || 0),
          })));
        }

        const buyersData = (buyersResult?.data || []).map((buyer) => ({
          ...buyer,
          email: (buyer.email || "").toLowerCase(),
          min_kg: getOptionalKgLimit(buyer.min_kg) == null ? "" : Number(buyer.min_kg),
          max_kg: getOptionalKgLimit(buyer.max_kg) == null ? "" : Number(buyer.max_kg),
        }));

        if (buyersResult?.error && buyersResult.error.code !== "PGRST116") {
          if (isMissingRefreshTokenError(buyersResult.error)) {
            await invalidateSession();
            return;
          }
          setAuthError(buyersResult.error.message);
        } else {
          setBuyers(buyersData);
        }

        if (buyerOffersResult?.error && buyerOffersResult.error.code !== "PGRST116") {
          if (isMissingRefreshTokenError(buyerOffersResult.error)) {
            await invalidateSession();
            return;
          }
          setAuthError(buyerOffersResult.error.message);
        } else {
          const sellerIds = Array.from(
            new Set(
              (buyerOffersResult?.data || [])
                .map((offer) => offer?.seller_user_id)
                .filter(Boolean)
            )
          );
          const sellerProfilesById = {};

          if (sellerIds.length > 0) {
            const { data: sellerProfilesData, error: sellerProfilesError } = await supabase
              .from("profiles")
              .select("id, email, display_name, company_name, business_id, address, postcode, city, contact_email, phone, commercial_fishing_id")
              .in("id", sellerIds);

            if (sellerProfilesError) {
              if (isMissingRefreshTokenError(sellerProfilesError)) {
                await invalidateSession();
                return;
              }
              setAuthError(sellerProfilesError.message);
            } else {
              (sellerProfilesData || []).forEach((sellerProfile) => {
                sellerProfilesById[sellerProfile.id] = sellerProfile;
              });
            }
          }

          setBuyerOffers((buyerOffersResult?.data || []).map((offer) => {
            const buyer = buyersData.find((item) => item.id === offer.buyer_id || item.email === (offer.buyer_email || "").toLowerCase());
            const sellerProfile = sellerProfilesById[offer.seller_user_id] || {};
            return {
              ...offer,
              buyer_email: (offer.buyer_email || "").toLowerCase(),
              total_kilos: Number(offer.total_kilos || 0),
              price_per_kg: offer.price_per_kg == null || offer.price_per_kg === "" ? parsePricePerKgFromNotes(offer.notes) : Number(offer.price_per_kg),
              counter_price_per_kg: offer.counter_price_per_kg == null ? "" : Number(offer.counter_price_per_kg),
              reserved_kilos: offer.reserved_kilos == null ? "" : Number(offer.reserved_kilos),
              delivery_method: offer.delivery_method || "Nouto",
              delivery_possible: Boolean(offer.delivery_possible),
              transport_mode: offer.transport_mode || "",
              origin_point_id: offer.origin_point_id || "",
              transport_company_id: offer.transport_company_id || "",
              seller_origin_city: offer.seller_origin_city || "",
              delivery_destination_city: offer.delivery_destination_city || "",
              route_price_eur: offer.route_price_eur == null ? "" : Number(offer.route_price_eur),
              total_price_eur: offer.total_price_eur == null ? "" : Number(offer.total_price_eur),
              delivered_price_per_kg: offer.delivered_price_per_kg == null ? "" : Number(offer.delivered_price_per_kg),
              delivery_destinations: Array.isArray(offer.delivery_destinations) ? offer.delivery_destinations : [],
              delivery_area: offer.delivery_area || "",
              delivery_cost: offer.delivery_cost == null ? "" : Number(offer.delivery_cost),
              earliest_delivery_date: offer.earliest_delivery_date || "",
              cold_transport: Boolean(offer.cold_transport),
              buyer_type: serializeBuyerTypes(buyer?.buyer_type || ""),
              buyer_company_name: buyer?.company_name || "",
              buyer_contact_name: buyer?.contact_name || "",
              buyer_phone: buyer?.phone || "",
              buyer_business_id: buyer?.business_id || offer.buyer_business_id || "",
              buyer_delivery_address: buyer?.delivery_address || offer.buyer_delivery_address || "",
              buyer_delivery_postcode: buyer?.delivery_postcode || offer.buyer_delivery_postcode || "",
              buyer_delivery_city: buyer?.delivery_city || offer.buyer_delivery_city || "",
              buyer_billing_address: buyer?.billing_address || offer.buyer_billing_address || "",
              buyer_billing_postcode: buyer?.billing_postcode || offer.buyer_billing_postcode || "",
              buyer_billing_city: buyer?.billing_city || offer.buyer_billing_city || "",
              buyer_billing_email: buyer?.billing_email || offer.buyer_billing_email || "",
              seller_name: offer.seller_name || sellerProfile.company_name || sellerProfile.display_name || "",
              seller_company_name: offer.seller_company_name || sellerProfile.company_name || "",
              seller_business_id: offer.seller_business_id || sellerProfile.business_id || "",
              sellerBusinessIdFallback: offer.seller_business_id || sellerProfile.business_id || "",
              seller_address: offer.seller_address || sellerProfile.address || "",
              seller_postcode: offer.seller_postcode || sellerProfile.postcode || "",
              seller_city: offer.seller_city || sellerProfile.city || "",
              seller_contact_email: offer.seller_contact_email || sellerProfile.contact_email || sellerProfile.email || "",
              seller_email: offer.seller_email || sellerProfile.email || "",
              seller_phone: offer.seller_phone || sellerProfile.phone || "",
              seller_commercial_fishing_id: offer.seller_commercial_fishing_id || sellerProfile.commercial_fishing_id || "",
              seller_bank_account_iban: offer.seller_bank_account_iban || "",
              seller_bank_bic: offer.seller_bank_bic || "",
              billing_status: offer.billing_status || "unbilled",
              billing_month: offer.billing_month || "",
              owner_commission_status: offer.owner_commission_status || "unbilled",
              owner_commission_billed_at: offer.owner_commission_billed_at || null,
              owner_commission_paid_at: offer.owner_commission_paid_at || null,
              owner_commission_month: offer.owner_commission_month || "",
              owner_commission_rate: offer.owner_commission_rate == null ? "" : Number(offer.owner_commission_rate),
              owner_trade_value: offer.owner_trade_value == null ? "" : Number(offer.owner_trade_value),
              owner_commission_amount: offer.owner_commission_amount == null ? "" : Number(offer.owner_commission_amount),
              fulfillment_status: offer.fulfillment_status || (isBuyerOfferAccepted(offer.status) ? "awaiting_contact" : ""),
            };
          }));
        }
      } catch (error) {
        if (isMissingRefreshTokenError(error)) {
          await invalidateSession();
          return;
        }
        setAuthError(String(error?.message || error));
      }
    };

    loadData();
  }, [buyerOfferIdentityFilters, entryScope, profile, refreshTick]);

  useEffect(() => {
    if (!profile) return;
    if (accountFormDirty) return;
    const vesselIds = getCommercialFishingVesselIds(profile);
    const buyerAccountData = profile.role === "buyer" ? linkedBuyerRecord : null;
    const nextForm = {
      displayName: profile.display_name || "",
      buyerType: serializeBuyerTypes(buyerAccountData?.buyer_type || "ravintola"),
      minKg: getOptionalKgLimit(buyerAccountData?.min_kg) == null ? "" : Number(buyerAccountData.min_kg),
      maxKg: getOptionalKgLimit(buyerAccountData?.max_kg) == null ? "" : Number(buyerAccountData.max_kg),
      eviraFacilityId: profile.evira_facility_id || "",
      commercialFishingVesselId: profile.commercial_fishing_vessel_id || vesselIds[0] || "",
      commercialFishingVesselIdsText: vesselIds.join("\n"),
      commercialFishingId: profile.commercial_fishing_id || "",
      vatLiable: Boolean((profile.role === "buyer" ? buyerAccountData?.vat_liable : undefined) ?? profile.vat_liable),
      vatNumber: (profile.role === "buyer" ? buyerAccountData?.vat_number : undefined) || profile.vat_number || "",
      pickupAddress: profile.pickup_address || "",
      companyName: buyerAccountData?.company_name || profile.company_name || "",
      businessId: buyerAccountData?.business_id || profile.business_id || "",
      address: profile.address || "",
      postcode: profile.postcode || "",
      city: buyerAccountData?.city || profile.city || "",
      billingAddress: buyerAccountData?.billing_address || profile.billing_address || "",
      billingPostcode: buyerAccountData?.billing_postcode || profile.billing_postcode || "",
      billingCity: buyerAccountData?.billing_city || profile.billing_city || "",
      billingEmail: buyerAccountData?.billing_email || profile.billing_email || "",
      einvoiceAddress: profile.einvoice_address || "",
      bankAccountIban: profile.bank_account_iban || "",
      bankBic: profile.bank_bic || "",
      contactEmail: profile.contact_email || profile.email || "",
      accountantEmail: profile.accountant_email || "",
      phone: buyerAccountData?.phone || profile.phone || "",
      waterType: profile.water_type || "",
      contactName: buyerAccountData?.contact_name || "",
      deliveryAddress: buyerAccountData?.delivery_address || "",
      deliveryPostcode: buyerAccountData?.delivery_postcode || "",
      deliveryCity: buyerAccountData?.delivery_city || "",
      notes: buyerAccountData?.notes || "",
    };
    accountFormSyncingRef.current = true;
    setAccountForm(nextForm);
    setAccountFormDirty(false);
    setAccountBillingSameAsDelivery(
      profile.role === "buyer" ? false : billingMatchesAddress(nextForm)
    );
  }, [profile, linkedBuyerRecord, accountFormDirty]);

  const handleManualRefresh = () => {
    setAuthError("");
    setAuthInfo("Päivitetään tietoja...");
    setRefreshTick((prev) => prev + 1);
    window.setTimeout(() => {
      setAuthInfo((current) => (current === "Päivitetään tietoja..." ? "Tiedot päivitetty." : current));
    }, 700);
  };

  useEffect(() => {
    if (!accountFormInitializedRef.current) {
      accountFormInitializedRef.current = true;
      return;
    }
    if (accountFormSyncingRef.current) {
      accountFormSyncingRef.current = false;
      return;
    }
    setAccountFormDirty(true);
  }, [accountForm]);

  useEffect(() => {
    if (!labelPrintEntry) return;
    setLabelPrintWaterType(String(
      labelPrintEntry?.waterType ||
      profile?.water_type ||
      getStoredCatchFormDefaults(profile).waterType ||
      ""
    ).trim());
  }, [labelPrintEntry, profile?.water_type]);

  useEffect(() => {
    if (!fisherInfoInitializedRef.current) {
      fisherInfoInitializedRef.current = true;
      return;
    }
    if (fisherInfoSyncingRef.current) {
      fisherInfoSyncingRef.current = false;
      return;
    }
    setFisherInfoDirty(true);
  }, [fisherInfoForm]);

  useEffect(() => {
    if (commercialFishingVesselOptions.length === 0) return;
    setForm((prev) => {
      if (prev.fishingWithoutVessel) {
        return prev;
      }
      if (prev.selectedVesselId && commercialFishingVesselOptions.includes(prev.selectedVesselId)) {
        return prev;
      }
      return { ...prev, selectedVesselId: commercialFishingVesselOptions[0] };
    });
  }, [commercialFishingVesselOptions]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const gearCountOptions = buildRememberedOptions(form.gearCount, savedGearCountOptions);
      const fishingDurationOptions = buildRememberedOptions(form.fishingDurationDays, savedFishingDurationOptions);
      const netHeightOptions = buildRememberedOptions(form.netHeight, savedNetHeightOptions);
      const netMeshSizeOptions = buildRememberedOptions(form.netMeshSize, savedNetMeshSizeOptions);
      const fykeHeightOptions = buildRememberedOptions(form.fykeHeight, savedFykeHeightOptions);
      const nextGearProfiles = {
        ...savedGearProfiles,
        [form.gear || "Rysä"]: {
          gearCount: form.gearCount || "",
          gearCountOptions,
          fishingDurationDays: form.fishingDurationDays || "",
          fishingDurationOptions,
          netHeight: form.netHeight || "",
          netHeightOptions,
          netMeshSize: form.netMeshSize || "",
          netMeshSizeOptions,
          fykeHeight: form.fykeHeight || "",
          fykeHeightOptions,
        },
      };
      window.localStorage.setItem(getCatchFormDefaultsStorageKey(profile), JSON.stringify({
        area: form.area || "Saimaa",
        waterType: form.waterType || "",
        customLakeAreas: savedCustomLakeAreas,
        customSeaAreas: savedCustomSeaAreas,
        municipality: form.municipality || "",
        landingPlace: form.landingPlace || "",
        landingPlaces: savedLandingPlaces,
        deliveryDestinations: normalizeDestinationCities(form.deliveryDestinations),
        deliveryArea: derivedDeliveryArea || "",
        gear: form.gear || "Rysä",
        gearCount: form.gearCount || "",
        gearCountOptions,
        fishingDurationDays: form.fishingDurationDays || "",
        fishingDurationOptions,
        netHeight: form.netHeight || "",
        netHeightOptions,
        netMeshSize: form.netMeshSize || "",
        netMeshSizeOptions,
        fykeHeight: form.fykeHeight || "",
        fykeHeightOptions,
        gearProfiles: nextGearProfiles,
      }));
      setSavedGearProfiles((prev) => {
        const previousSerialized = JSON.stringify(prev || {});
        const nextSerialized = JSON.stringify(nextGearProfiles);
        return previousSerialized === nextSerialized ? prev : nextGearProfiles;
      });
      setSavedGearCountOptions((prev) => {
        const next = buildRememberedOptions(form.gearCount, prev);
        if (next.length === prev.length && next.every((item, index) => item === prev[index])) return prev;
        return next;
      });
      setSavedFishingDurationOptions((prev) => {
        const next = buildRememberedOptions(form.fishingDurationDays, prev);
        if (next.length === prev.length && next.every((item, index) => item === prev[index])) return prev;
        return next;
      });
      setSavedNetHeightOptions((prev) => {
        const next = buildRememberedOptions(form.netHeight, prev);
        if (next.length === prev.length && next.every((item, index) => item === prev[index])) return prev;
        return next;
      });
      setSavedNetMeshSizeOptions((prev) => {
        const next = buildRememberedOptions(form.netMeshSize, prev);
        if (next.length === prev.length && next.every((item, index) => item === prev[index])) return prev;
        return next;
      });
      setSavedFykeHeightOptions((prev) => {
        const next = buildRememberedOptions(form.fykeHeight, prev);
        if (next.length === prev.length && next.every((item, index) => item === prev[index])) return prev;
        return next;
      });
    } catch {
      // ignore storage errors
    }
  }, [
    form.area,
    form.waterType,
    catchAreaSelector,
    form.municipality,
    form.landingPlace,
    form.deliveryDestinations,
    form.gear,
    form.gearCount,
    form.fishingDurationDays,
    form.netHeight,
    form.netMeshSize,
    form.fykeHeight,
    savedCustomLakeAreas,
    savedCustomSeaAreas,
    savedLandingPlaces,
    savedGearProfiles,
    savedGearCountOptions,
    savedFishingDurationOptions,
    savedNetHeightOptions,
    savedNetMeshSizeOptions,
    savedFykeHeightOptions,
    derivedDeliveryArea,
  ]);

  const applyAccountDeliveryToBilling = useCallback(() => {
    setAccountForm((prev) => ({
      ...prev,
      billingAddress: prev.deliveryAddress,
      billingPostcode: prev.deliveryPostcode,
      billingCity: prev.deliveryCity,
    }));
  }, []);

  const applyAccountAddressToBilling = useCallback(() => {
    setAccountForm((prev) => ({
      ...prev,
      billingAddress: prev.address,
      billingPostcode: prev.postcode,
      billingCity: prev.city,
    }));
  }, []);

  const applyBuyerDeliveryToBilling = useCallback(() => {
    setBuyerForm((prev) => ({
      ...prev,
      billing_address: prev.delivery_address,
      billing_postcode: prev.delivery_postcode,
      billing_city: prev.delivery_city,
    }));
  }, []);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (!q) return true;
      return [entry.species, entry.area, entry.municipality, entry.spot, entry.gear, entry.notes, entry.ownerName].join(" ").toLowerCase().includes(q);
    });
  }, [entries, search]);

  const groupedFilteredEntries = useMemo(() => {
    const formatter = new Intl.DateTimeFormat("fi-FI", {
      month: "long",
      year: "numeric",
    });

    const groups = filteredEntries.reduce((acc, entry) => {
      const monthKey = String(entry.date || "").slice(0, 7) || "unknown";
      const existingGroup = acc.get(monthKey) || {
        key: monthKey,
        label: monthKey === "unknown"
          ? "Päivämäärä puuttuu"
          : formatter.format(new Date(`${monthKey}-01T00:00:00`)),
        entries: [],
        totalKilos: 0,
        forSaleKilos: 0,
        speciesSummary: new Map(),
      };

      existingGroup.entries.push(entry);
      existingGroup.totalKilos += Number(entry.kilos || 0);
      const speciesKey = formatSpeciesForSale(entry.species);
      existingGroup.speciesSummary.set(
        speciesKey,
        Number(existingGroup.speciesSummary.get(speciesKey) || 0) + Number(entry.kilos || 0)
      );
      if (entry.offerToShops || entry.offerToRestaurants || entry.offerToWholesalers) {
        existingGroup.forSaleKilos += Number(entry.kilos || 0);
      }

      acc.set(monthKey, existingGroup);
      return acc;
    }, new Map());

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        speciesSummary: Array.from(group.speciesSummary.entries())
          .map(([species, kilos]) => ({ species, kilos }))
          .sort((a, b) => b.kilos - a.kilos),
      }))
      .sort((a, b) => b.key.localeCompare(a.key));
  }, [filteredEntries]);

  const saleEntries = useMemo(() => entries.filter((entry) => entry.offerToShops || entry.offerToRestaurants || entry.offerToWholesalers), [entries]);
  const processedSaleEntries = useMemo(() => processedEntries.filter((entry) => entry.offerToShops || entry.offerToRestaurants || entry.offerToWholesalers), [processedEntries]);
  const availableSourceEntries = useMemo(
    () => (profile?.role === "processor" ? processorSourceEntries : entries)
      .filter((entry) => entry.batchId && (Number(entry.kilos || 0) > 0 || Number(entry.count || 0) > 0))
      .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()),
    [entries, processorSourceEntries, profile?.role],
  );
  const selectedProcessedSourceEntries = useMemo(
    () => availableSourceEntries.filter((entry) => processedForm.sourceEntryIds.includes(entry.id)),
    [availableSourceEntries, processedForm.sourceEntryIds],
  );
  const processedNutritionPreview = useMemo(
    () => calculateProcessedNutritionPer100g(processedRecipeRows),
    [processedRecipeRows],
  );
  const processedNutritionRows = useMemo(
    () => buildProcessedNutritionRows(processedNutritionPreview.nutrition),
    [processedNutritionPreview],
  );

  const updateProcessedRecipeRow = (rowId, changes) => {
    setProcessedRecipeRows((prev) => prev.map((row) => {
      if (row.id !== rowId) return row;
      return {
        ...row,
        ...changes,
      };
    }));
  };

  const updateProcessedRecipeManualNutrition = (rowId, key, value) => {
    setProcessedRecipeRows((prev) => prev.map((row) => {
      if (row.id !== rowId) return row;
      return {
        ...row,
        manualNutrition: {
          ...(row.manualNutrition || createEmptyProcessedManualNutrition()),
          [key]: value,
        },
      };
    }));
  };

  const addProcessedRecipeRow = () => {
    setProcessedRecipeRows((prev) => [...prev, createProcessedRecipeRow()]);
  };

  const removeProcessedRecipeRow = (rowId) => {
    setProcessedRecipeRows((prev) => (prev.length <= 1 ? [createProcessedRecipeRow()] : prev.filter((row) => row.id !== rowId)));
  };

  const handleSearchProcessedRecipeRow = async (rowId) => {
    const targetRow = processedRecipeRows.find((row) => row.id === rowId);
    const query = String(targetRow?.ingredientName || "").trim();
    if (!query) {
      updateProcessedRecipeRow(rowId, {
        searchError: "Kirjoita ensin ainesosan nimi Fineli-hakua varten.",
        searchResults: [],
      });
      return;
    }

    const manualPreset = getProcessedManualIngredientPreset(query);
    if (manualPreset) {
      updateProcessedRecipeRow(rowId, {
        searchLoading: false,
        searchError: "",
        searchResults: [{ id: `manual:${normalizeFineliText(query)}`, name: `${manualPreset.name} (vakioarvo)` }],
        fineliFoodId: `manual:${normalizeFineliText(query)}`,
        fineliFoodName: `${manualPreset.name} (vakioarvo)`,
        fineliNutrients: manualPreset.nutrition,
        nutritionMode: "manual",
        manualNutrition: createEmptyProcessedManualNutrition(manualPreset.nutrition),
      });
      return;
    }

    updateProcessedRecipeRow(rowId, {
      searchLoading: true,
      searchError: "",
      searchResults: [],
    });

    try {
      const results = await searchFineliFoodsByQuery(query);
      updateProcessedRecipeRow(rowId, {
        searchLoading: false,
        searchResults: results,
        searchError: results.length === 0 ? "Finelista ei löytynyt osumia tällä haulla." : "",
      });
    } catch (error) {
      updateProcessedRecipeRow(rowId, {
        searchLoading: false,
        searchResults: [],
        searchError: String(error?.message || error || "Fineli-haku epäonnistui."),
      });
    }
  };

  const handleSelectProcessedRecipeFood = async (rowId, nextFoodId) => {
    if (!nextFoodId) {
      updateProcessedRecipeRow(rowId, {
        fineliFoodId: "",
        fineliFoodName: "",
        fineliNutrients: null,
      });
      return;
    }

    if (String(nextFoodId).startsWith("manual:")) {
      const targetRow = processedRecipeRows.find((row) => row.id === rowId);
      const manualPreset = getProcessedManualIngredientPreset(targetRow?.ingredientName || "");
      if (!manualPreset) {
        updateProcessedRecipeRow(rowId, {
          fineliFoodId: "",
          fineliFoodName: "",
          fineliNutrients: null,
          searchError: "Vakioaineen arvoja ei löytynyt.",
        });
        return;
      }
      updateProcessedRecipeRow(rowId, {
        searchLoading: false,
        searchError: "",
        fineliFoodId: nextFoodId,
        fineliFoodName: `${manualPreset.name} (vakioarvo)`,
        fineliNutrients: manualPreset.nutrition,
        nutritionMode: "manual",
        manualNutrition: createEmptyProcessedManualNutrition(manualPreset.nutrition),
      });
      return;
    }

    const targetRow = processedRecipeRows.find((row) => row.id === rowId);
    const selectedResult = (targetRow?.searchResults || []).find((item) => item.id === nextFoodId);
    updateProcessedRecipeRow(rowId, {
      searchLoading: true,
      searchError: "",
      fineliFoodId: nextFoodId,
      fineliFoodName: selectedResult?.name || targetRow?.fineliFoodName || "",
    });

    try {
      const nutrition = await fetchFineliFoodNutrition(nextFoodId);
      updateProcessedRecipeRow(rowId, {
        searchLoading: false,
        fineliFoodName: selectedResult?.name || targetRow?.fineliFoodName || "",
        fineliNutrients: nutrition,
        nutritionMode: "fineli",
      });
    } catch (error) {
      updateProcessedRecipeRow(rowId, {
        searchLoading: false,
        fineliFoodId: "",
        fineliFoodName: "",
        fineliNutrients: null,
        searchError: String(error?.message || error || "Fineli-tuotteen ravintoarvotietojen haku epäonnistui."),
      });
    }
  };

  const totals = useMemo(() => {
    const totalKg = entries.reduce((sum, e) => sum + Number(e.kilos || 0), 0);
    const forSaleKg = saleEntries.reduce((sum, e) => sum + Number(e.kilos || 0), 0);
    const totalProcessedKg = processedEntries.reduce((sum, e) => sum + Number(e.kilos || 0), 0);
    const processedForSaleKg = processedSaleEntries.reduce((sum, e) => sum + Number(e.kilos || 0), 0);
    const speciesSummary = Array.from(new Set([...fishSpecies.filter((species) => species !== "Muu"), ...entries.map((entry) => entry.species).filter(Boolean)]))
      .map((species) => ({ species, kilos: entries.filter((e) => e.species === species).reduce((sum, e) => sum + Number(e.kilos || 0), 0) }))
      .filter((item) => item.kilos > 0)
      .sort((a, b) => b.kilos - a.kilos);
    const processedSummary = processedProductTypes
      .map((productType) => ({ productType, kilos: processedEntries.filter((e) => e.productType === productType).reduce((sum, e) => sum + Number(e.kilos || 0), 0) }))
      .filter((item) => item.kilos > 0)
      .sort((a, b) => b.kilos - a.kilos);
    return { totalKg, forSaleKg, totalProcessedKg, processedForSaleKg, speciesSummary, processedSummary };
  }, [entries, saleEntries, processedEntries, processedSaleEntries]);

  const addSpeciesRow = () => setSpeciesRows((prev) => [...prev, createSpeciesRow()]);
  const updateSpeciesRow = (id, field, value) => setSpeciesRows((prev) => prev.map((row) => {
    if (row.id !== id) return row;
    if (field === "species") {
      const nextLabel = value === "Muu" ? row.customSpecies : value;
      const crayfish = isCrayfishSpecies(nextLabel);
      return {
        ...row,
        species: value,
        kilos: crayfish ? "" : row.kilos,
        customSpecies: value === "Muu" ? row.customSpecies : "",
      };
    }
    if (field === "price_per_kg") {
      return {
        ...row,
        price_per_kg: value,
        price_per_kg_gross_input: "",
      };
    }
    if (field === "price_per_kg_gross") {
      return applyGrossPriceInput(row, value, {
        parseLocaleNumber,
        calculateNetPrice,
      });
    }
    return { ...row, [field]: value };
  }));
  const removeSpeciesRow = (id) => setSpeciesRows((prev) => (prev.length === 1 ? [createSpeciesRow()] : prev.filter((row) => row.id !== id)));
  const duplicateSpeciesRow = (id) => setSpeciesRows((prev) => {
    const row = prev.find((item) => item.id === id);
    if (!row) return prev;
    const copy = { ...row, id: safeId() };
    const index = prev.findIndex((item) => item.id === id);
    return [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)];
  });

  const handleSignIn = async () => {
    if (authSubmitting) return;
    setAuthSubmitting(true);
    setAuthError("");
    setAuthInfo("");
    try {
      const email = normalizeEmail(authForm.email);
      const password = authForm.password;
      const signInPromise = supabase.auth.signInWithPassword({ email, password });
      const timeoutPromise = new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error("SIGN_IN_TIMEOUT")), isNativeCapacitorApp() ? 10000 : 12000);
      });
      const { error } = await Promise.race([signInPromise, timeoutPromise]);
      if (error) {
        if (isMissingRefreshTokenError(error)) {
          await invalidateSession();
          return;
        }
        const errorMessage = String(error.message || "");
        if (errorMessage.toLowerCase().includes("failed to fetch")) {
          setAuthError("Yhteys palvelimeen epäonnistui. Tarkista Android-emulaattorin verkkoyhteys ja kokeile uudelleen.");
          return;
        }
        setAuthError("Väärä sähköposti tai salasana – tai käyttäjää ei ole vielä rekisteröity.");
      }
    } catch (error) {
      const message = String(error?.message || error || "");
      if (message.includes("SIGN_IN_TIMEOUT")) {
        setAuthError("Kirjautuminen Androidissa kesti liian kauan. Tarkista verkkoyhteys ja kokeile uudelleen.");
      } else {
        setAuthError(message || "Kirjautuminen epäonnistui.");
      }
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleSignUp = async () => {
    if (authSubmitting) return;
    setAuthSubmitting(true);
    setAuthError("");
    setAuthInfo("");
    try {
      const email = normalizeEmail(authForm.email);
      const password = authForm.password;
      const displayName = authForm.displayName.trim();
      const requestedRole = authForm.requestedRole === "buyer" ? "buyer" : authForm.requestedRole === "processor" ? "processor" : "member";
      if (!email || !password || !displayName) {
        setAuthError("Täytä sähköposti, salasana ja nimi.");
        return;
      }
      const { error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName, requested_role: requestedRole } } });
      if (error) {
        if (isMissingRefreshTokenError(error)) {
          await invalidateSession();
          return;
        }
        const message = String(error.message || "");
        if (message.toLowerCase().includes("user already registered")) {
          setAuthInfo("");
          setAuthError("Tällä sähköpostilla on jo käyttäjätili. Et tarvitse uutta tiliä ostajaroolia varten. Kirjaudu sisään olemassa olevalla tunnuksella ja pyydä ylläpitäjää lisäämään sinulle myös ostajarooli.");
          setAuthMode("signin");
          return;
        }
        setAuthError(error.message);
        return;
      }
      if (requestedRole === "processor") {
        setAuthInfo("Tunnus luotu. Jalostajarooli odottaa vielä ylläpitäjän hyväksyntää ennen kuin appi aukeaa.");
      } else {
        setAuthInfo("Tunnus luotu. Voit kirjautua sisään heti ja täydentää omat tiedot ennen kaupallisten toimintojen käyttöä.");
      }
      setAuthMode("signin");
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    if (authSubmitting) return;
    setAuthSubmitting(true);
    setAuthError("");
    setAuthInfo("");
    try {
      const email = normalizeEmail(authForm.email);
      if (!email) {
        setAuthError("Syötä sähköpostiosoite ennen salasanan palautusta.");
        return;
      }
      const redirectTo = typeof window !== "undefined" ? window.location.origin : getPublicAppBaseUrl();
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) {
        if (isMissingRefreshTokenError(error)) {
          await invalidateSession();
          return;
        }
        setAuthError(error.message);
        return;
      }
      setAuthInfo("Salasanan palautuslinkki lähetettiin sähköpostiisi.");
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleResetRecoveredPassword = async () => {
    if (authSubmitting) return;
    setAuthSubmitting(true);
    setAuthError("");
    setAuthInfo("");
    try {
      const password = authForm.password;
      const confirmPassword = authForm.confirmPassword;
      if (!password || password.length < 8) {
        setAuthError("Uuden salasanan pitää olla vähintään 8 merkkiä.");
        return;
      }
      if (password !== confirmPassword) {
        setAuthError("Salasanat eivät täsmää.");
        return;
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        if (isMissingRefreshTokenError(error)) {
          await invalidateSession();
          return;
        }
        setAuthError(error.message);
        return;
      }
      try {
        await unregisterPushTokenOwnership(currentPushTokenRef.current);
      } catch {
        // ignore token cleanup failure
      }
      currentPushTokenRef.current = "";
      await supabase.auth.signOut();
      setSession(null);
      setProfile(null);
      setAvailableRoleOptions([]);
      setRoleSelectionOpen(false);
      setAuthForm((prev) => ({ ...prev, password: "", confirmPassword: "" }));
      setAuthMode("signin");
      setAuthInfo("Salasana vaihdettu. Kirjaudu nyt sisään uudella salasanalla.");
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await unregisterPushTokenOwnership(currentPushTokenRef.current);
    } catch {
      // ignore logout cleanup failure
    }
    currentPushTokenRef.current = "";
    await clearBrokenSession();
    setProfile(null);
    setSession(null);
    setAvailableRoleOptions([]);
    setRoleSelectionOpen(false);
  };

  const handleRoleSelect = async (selectedRole) => {
    if (!profile || !selectedRole) return;
    setAuthError("");
    setAuthInfo("");

    const currentRole = getMatchingAllowedRole(availableRoleOptions, profile);
    if (currentRole?.id === selectedRole.id) {
      setRoleSelectionOpen(false);
      return;
    }

    const { data: updatedProfile, error } = await supabase
      .from("profiles")
      .update({
        role: selectedRole.role,
        buyer_id: selectedRole.buyer_id || null,
        is_active: selectedRole.is_active,
      })
      .eq("id", profile.id)
      .select("*")
      .single();

    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setAuthError(error.message);
      return;
    }

    const normalizedUpdatedProfile = {
      ...updatedProfile,
      email: normalizeEmail(updatedProfile.email || profile.email || ""),
    };
    setProfile(normalizedUpdatedProfile);
    setRoleSelectionOpen(false);
    setAccountPanelOpen(false);
    setActiveTab("dashboard");
    setRefreshTick((prev) => prev + 1);
    setAuthInfo(`Rooli vaihdettu: ${buildRoleOptionLabel(selectedRole, buyers)}`);
  };

  const handleSaveOwnDetails = async () => {
    if (!profile) return;
    setAuthError("");
    setAuthInfo("");

    const displayName = accountForm.displayName.trim();
    if (!displayName) {
      setAuthError("Täytä vähintään nimi.");
      return;
    }
    if (accountForm.vatLiable && !String(accountForm.vatNumber || "").trim()) {
      setAuthError("Täytä ALV-numero, jos toiminta on ALV-velvollista.");
      return;
    }
    const normalizedBuyerMinKg = getOptionalKgLimit(accountForm.minKg);
    const normalizedBuyerMaxKg = getOptionalKgLimit(accountForm.maxKg);
    if (
      profile.role === "buyer" &&
      normalizedBuyerMinKg != null &&
      normalizedBuyerMaxKg != null &&
      normalizedBuyerMinKg > normalizedBuyerMaxKg
    ) {
      setAuthError("Min ostomäärä ei voi olla suurempi kuin max ostomäärä.");
      return;
    }

    setAccountSaving(true);
    try {
      const normalizedVesselIds = parseCommercialFishingVesselIds(accountForm.commercialFishingVesselIdsText);
      const savedAccountForm = {
        ...accountForm,
        displayName,
        buyerType: serializeBuyerTypes(accountForm.buyerType),
        minKg: normalizedBuyerMinKg == null ? "" : normalizedBuyerMinKg,
        maxKg: normalizedBuyerMaxKg == null ? "" : normalizedBuyerMaxKg,
        commercialFishingId: accountForm.commercialFishingId.trim(),
        commercialFishingVesselId: accountForm.commercialFishingVesselId.trim() || normalizedVesselIds[0] || "",
        commercialFishingVesselIdsText: accountForm.commercialFishingVesselIdsText.trim(),
        vatLiable: Boolean(accountForm.vatLiable),
        vatNumber: String(accountForm.vatNumber || "").trim().toUpperCase(),
        companyName: accountForm.companyName.trim(),
        businessId: accountForm.businessId.trim(),
        address: accountForm.address.trim(),
        postcode: accountForm.postcode.trim(),
        city: accountForm.city.trim(),
        billingAddress: accountForm.billingAddress.trim(),
        billingPostcode: accountForm.billingPostcode.trim(),
        billingCity: accountForm.billingCity.trim(),
        billingEmail: accountForm.billingEmail.trim().toLowerCase(),
        einvoiceAddress: accountForm.einvoiceAddress.trim(),
        bankAccountIban: accountForm.bankAccountIban.trim(),
        bankBic: accountForm.bankBic.trim(),
        contactEmail: accountForm.contactEmail.trim().toLowerCase(),
        accountantEmail: accountForm.accountantEmail.trim().toLowerCase(),
        phone: accountForm.phone.trim(),
        waterType: String(accountForm.waterType || "").trim(),
        contactName: accountForm.contactName.trim(),
        deliveryAddress: accountForm.deliveryAddress.trim(),
        deliveryPostcode: accountForm.deliveryPostcode.trim(),
        deliveryCity: accountForm.deliveryCity.trim(),
        notes: accountForm.notes.trim(),
      };
      const profilePayload = {
        display_name: displayName,
        vat_liable: Boolean(accountForm.vatLiable),
        vat_number: accountForm.vatLiable ? (String(accountForm.vatNumber || "").trim().toUpperCase() || null) : null,
        ...(profile.role === "processor"
          ? {
              evira_facility_id: accountForm.eviraFacilityId.trim() || null,
              pickup_address: accountForm.pickupAddress.trim() || null,
              company_name: accountForm.companyName.trim() || null,
              business_id: accountForm.businessId.trim() || null,
              address: accountForm.address.trim() || null,
              postcode: accountForm.postcode.trim() || null,
              city: accountForm.city.trim() || null,
              billing_address: accountForm.billingAddress.trim() || null,
              billing_postcode: accountForm.billingPostcode.trim() || null,
              billing_city: accountForm.billingCity.trim() || null,
              billing_email: accountForm.billingEmail.trim().toLowerCase() || null,
              einvoice_address: accountForm.einvoiceAddress.trim() || null,
              bank_account_iban: accountForm.bankAccountIban.trim() || null,
              bank_bic: accountForm.bankBic.trim() || null,
              contact_email: accountForm.contactEmail.trim().toLowerCase() || null,
              accountant_email: accountForm.accountantEmail.trim().toLowerCase() || null,
              phone: accountForm.phone.trim() || null,
              water_type: accountForm.waterType || null,
            }
          : profile.role !== "buyer"
            ? {
              commercial_fishing_vessel_id: accountForm.commercialFishingVesselId.trim() || normalizedVesselIds[0] || null,
              commercial_fishing_vessel_ids: normalizedVesselIds,
              commercial_fishing_id: accountForm.commercialFishingId.trim() || null,
              pickup_address: accountForm.pickupAddress.trim() || null,
              company_name: accountForm.companyName.trim() || null,
              business_id: accountForm.businessId.trim() || null,
              address: accountForm.address.trim() || null,
              postcode: accountForm.postcode.trim() || null,
              city: accountForm.city.trim() || null,
              billing_address: accountForm.billingAddress.trim() || null,
              billing_postcode: accountForm.billingPostcode.trim() || null,
              billing_city: accountForm.billingCity.trim() || null,
              billing_email: accountForm.billingEmail.trim().toLowerCase() || null,
              einvoice_address: accountForm.einvoiceAddress.trim() || null,
              bank_account_iban: accountForm.bankAccountIban.trim() || null,
              bank_bic: accountForm.bankBic.trim() || null,
              contact_email: accountForm.contactEmail.trim().toLowerCase() || null,
              accountant_email: accountForm.accountantEmail.trim().toLowerCase() || null,
              phone: accountForm.phone.trim() || null,
              water_type: accountForm.waterType || null,
            }
          : linkedBuyerRecord?.id
            ? { buyer_id: linkedBuyerRecord.id }
            : {}),
      };

      const { data: updatedProfile, error: profileUpdateError } = await supabase
        .from("profiles")
        .update(profilePayload)
        .eq("id", profile.id)
        .select("*")
        .maybeSingle();
      if (profileUpdateError) {
        if (isMissingRefreshTokenError(profileUpdateError)) {
          await invalidateSession();
          return;
        }
        throw profileUpdateError;
      }

      if (profile.role === "buyer" && linkedBuyerRecord?.id) {
        const buyerPayload = {
          company_name: accountForm.companyName.trim(),
          buyer_type: serializeBuyerTypes(accountForm.buyerType),
          contact_name: accountForm.contactName.trim(),
          phone: accountForm.phone.trim(),
          min_kg: normalizedBuyerMinKg,
          max_kg: normalizedBuyerMaxKg,
          vat_liable: Boolean(accountForm.vatLiable),
          vat_number: accountForm.vatLiable ? String(accountForm.vatNumber || "").trim().toUpperCase() : "",
          city: accountForm.city.trim(),
          delivery_address: accountForm.deliveryAddress.trim(),
          delivery_postcode: accountForm.deliveryPostcode.trim(),
          delivery_city: accountForm.deliveryCity.trim(),
          billing_address: accountForm.billingAddress.trim(),
          billing_postcode: accountForm.billingPostcode.trim(),
          billing_city: accountForm.billingCity.trim(),
          billing_email: accountForm.billingEmail.trim().toLowerCase(),
          business_id: accountForm.businessId.trim(),
          notes: accountForm.notes.trim(),
        };
        if (!buyerPayload.company_name) {
          setAuthError("Täytä yrityksen nimi.");
          setAccountSaving(false);
          return;
        }
        const { data: updatedBuyerRecord, error: buyerUpdateError } = await supabase
          .from("buyers")
          .update(buyerPayload)
          .eq("id", linkedBuyerRecord.id)
          .select("*")
          .maybeSingle();
        if (buyerUpdateError) {
          if (isMissingRefreshTokenError(buyerUpdateError)) {
            await invalidateSession();
            return;
          }
          throw buyerUpdateError;
        }
        if (!updatedBuyerRecord) {
          throw new Error("Ostajan laskutustietoja ei voitu tallentaa tietokantaan. Tarkista buyers-taulun päivitysoikeudet Supabasessa.");
        }
        setBuyers((prev) => prev.map((buyer) => (
          String(buyer.id) === String(updatedBuyerRecord.id)
            ? { ...buyer, ...updatedBuyerRecord, email: normalizeEmail(updatedBuyerRecord.email || buyer.email || "") }
            : buyer
        )));
      }

      const normalizedUpdatedProfile = {
        ...(updatedProfile || { ...profile, ...profilePayload }),
        email: normalizeEmail(updatedProfile?.email || profile.email || ""),
      };
      setProfile(normalizedUpdatedProfile);
      accountFormSyncingRef.current = true;
      setAccountForm(savedAccountForm);
      setAccountBillingSameAsDelivery(
        profile.role === "buyer" ? false : billingMatchesAddress(savedAccountForm)
      );
      fisherInfoSyncingRef.current = true;
      setFisherInfoForm({
        commercialFishingId: normalizedUpdatedProfile.commercial_fishing_id || "",
        commercialFishingVesselId: normalizedUpdatedProfile.commercial_fishing_vessel_id || "",
        commercialFishingVesselIdsText: getCommercialFishingVesselIds(normalizedUpdatedProfile).join("\n"),
        eviraFacilityId: normalizedUpdatedProfile.evira_facility_id || "",
      });
      setAccountFormDirty(false);
      setFisherInfoDirty(false);
      if (profile.role !== "buyer") {
        setRefreshTick((prev) => prev + 1);
      }
      setAuthInfo("Omat tiedot tallennettu.");
    } catch (error) {
      setAuthError(String(error?.message || error));
    } finally {
      setAccountSaving(false);
    }
  };

  const handleApprovePendingProfile = async (pendingProfile) => {
    if (!profile || profile.role !== "owner" || !pendingProfile?.id) return;
    setUserMessage("");
    const normalizedEmail = normalizeEmail(pendingProfile.email || "");
    const role = pendingProfile.role === "buyer" ? "buyer" : pendingProfile.role === "processor" ? "processor" : "member";
    let buyerId = pendingProfile.buyer_id || null;

    if (role === "buyer" && !buyerId) {
      const existingBuyer = buyers.find((buyer) => normalizeEmail(buyer.email) === normalizedEmail);
      if (existingBuyer) {
        buyerId = existingBuyer.id;
      } else {
        const buyerPayload = {
          company_name: pendingProfile.company_name || pendingProfile.display_name || normalizedEmail,
          buyer_type: "ravintola",
          contact_name: pendingProfile.display_name || "",
          email: normalizedEmail,
          phone: pendingProfile.phone || "",
          city: pendingProfile.city || "",
          is_active: true,
          notes: "Luotu itsepalvelurekisteröinnin hyväksynnässä.",
          delivery_address: pendingProfile.address || "",
          delivery_postcode: pendingProfile.postcode || "",
          delivery_city: pendingProfile.city || "",
          billing_address: pendingProfile.billing_address || "",
          billing_postcode: pendingProfile.billing_postcode || "",
          billing_city: pendingProfile.billing_city || "",
          billing_email: pendingProfile.billing_email || normalizedEmail,
          business_id: pendingProfile.business_id || "",
        };
        const { data: insertedBuyer, error: buyerInsertError } = await supabase.from("buyers").insert(buyerPayload).select("id").single();
        if (buyerInsertError) {
          if (isMissingRefreshTokenError(buyerInsertError)) {
            await invalidateSession();
            return;
          }
          setUserMessage(buyerInsertError.message);
          return;
        }
        buyerId = insertedBuyer?.id || null;
      }
    }

    const allowedPayload = {
      email: normalizedEmail,
      display_name: pendingProfile.display_name || normalizedEmail,
      role,
      is_active: true,
      buyer_id: role === "buyer" ? buyerId : null,
    };

    const { data: existingAllowedUsers, error: existingAllowedError } = await findAllowedUsersByEmail(supabase, normalizedEmail);
    if (existingAllowedError && existingAllowedError.code !== "PGRST116") {
      if (isMissingRefreshTokenError(existingAllowedError)) {
        await invalidateSession();
        return;
      }
      setUserMessage(existingAllowedError.message);
      return;
    }

    const exactRoleRow = (existingAllowedUsers || []).find((item) => (
      item.role === role && String(item.buyer_id || "") === String(allowedPayload.buyer_id || "")
    )) || null;

    const allowedResult = exactRoleRow
      ? await supabase.from("allowed_users").update(allowedPayload).eq("id", exactRoleRow.id)
      : await supabase.from("allowed_users").insert(allowedPayload);
    if (allowedResult.error) {
      if (isMissingRefreshTokenError(allowedResult.error)) {
        await invalidateSession();
        return;
      }
      setUserMessage(allowedResult.error.message);
      return;
    }

    const { error: profileUpdateError } = await supabase
      .from("profiles")
      .update({ is_active: true, role, buyer_id: role === "buyer" ? buyerId : null })
      .eq("id", pendingProfile.id);
    if (profileUpdateError) {
      if (isMissingRefreshTokenError(profileUpdateError)) {
        await invalidateSession();
        return;
      }
      setUserMessage(profileUpdateError.message);
      return;
    }

    setUserMessage(`Käyttäjä ${pendingProfile.display_name || pendingProfile.email} hyväksytty roolille ${roleLabel(role)}.`);
    setRefreshTick((prev) => prev + 1);
  };

  const handleRejectPendingProfile = async (pendingProfile) => {
    if (!profile || profile.role !== "owner" || !pendingProfile?.id) return;
    if (normalizeEmail(pendingProfile.email) === normalizeEmail(profile?.email)) {
      setUserMessage("Et voi hylätä omaa käyttäjääsi.");
      return;
    }

    if (typeof window !== "undefined") {
      const confirmed = window.confirm(`Hylätäänkö käyttäjän ${pendingProfile.display_name || pendingProfile.email} pyyntö ja poistetaanko tunnus kokonaan?`);
      if (!confirmed) return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) {
      setUserMessage("Istunto puuttuu. Kirjaudu uudelleen sisään.");
      return;
    }

    const { error } = await invokeAdminDeleteEntity(accessToken, {
      type: "user",
      userId: pendingProfile.id,
      email: pendingProfile.email || "",
    });

    if (error) {
      if (error.status === 401) {
        await invalidateSession();
        return;
      }
      setUserMessage(`Pyynnön hylkäys epäonnistui: ${error.message}`);
      return;
    }

    setUserMessage(`Käyttäjän ${pendingProfile.display_name || pendingProfile.email} pyyntö hylätty ja tunnus poistettu.`);
    setRefreshTick((prev) => prev + 1);
  };

  const handleChangePassword = async () => {
    setAuthError("");
    setAuthInfo("");

    const newPassword = passwordForm.newPassword;
    const confirmPassword = passwordForm.confirmPassword;
    if (!newPassword || !confirmPassword) {
      setAuthError("Täytä uusi salasana kahteen kertaan.");
      return;
    }
    if (newPassword.length < 8) {
      setAuthError("Salasanassa pitää olla vähintään 8 merkkiä.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setAuthError("Salasanat eivät täsmää.");
      return;
    }

    setPasswordSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        if (isMissingRefreshTokenError(error)) {
          await invalidateSession();
          return;
        }
        throw error;
      }
      setPasswordForm({ newPassword: "", confirmPassword: "" });
      setAuthInfo("Salasana vaihdettu.");
    } catch (error) {
      setAuthError(String(error?.message || error));
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleCreateAllowedUser = async () => {
    if (!profile || profile.role !== "owner") return;
    setUserMessage("");
    const email = normalizeEmail(newAllowedForm.email);
    const displayName = newAllowedForm.displayName.trim();
    if (!email || !displayName) {
      setUserMessage("Täytä sähköposti ja nimi.");
      return;
    }
    const role = newAllowedForm.role === "owner" ? "owner" : newAllowedForm.role === "buyer" ? "buyer" : newAllowedForm.role === "processor" ? "processor" : "member";
    if (role === "buyer" && !newAllowedForm.buyer_id) {
      setUserMessage("Valitse ostajakäyttäjälle ostajarekisterin yritys.");
      return;
    }
    const payload = {
      email,
      display_name: displayName,
      role,
      is_active: true,
      buyer_id: role === "buyer" ? newAllowedForm.buyer_id : null,
    };

    const { data: existingAllowedUsers, error: existingAllowedUserError } = await findAllowedUsersByEmail(supabase, email);

    if (existingAllowedUserError && existingAllowedUserError.code !== "PGRST116") {
      if (isMissingRefreshTokenError(existingAllowedUserError)) {
        await invalidateSession();
        return;
      }
      setUserMessage(existingAllowedUserError.message);
      return;
    }

    const exactRoleRow = (existingAllowedUsers || []).find((item) => (
      item.role === role && String(item.buyer_id || "") === String(payload.buyer_id || "")
    )) || null;

    const { error } = exactRoleRow
      ? await supabase.from("allowed_users").update(payload).eq("id", exactRoleRow.id)
      : await supabase.from("allowed_users").insert(payload);

    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setUserMessage(error.message);
      return;
    }
    setNewAllowedForm({ email: "", displayName: "", role: "member", buyer_id: "" });
    setUserMessage(exactRoleRow ? `Rooli ${buildRoleOptionLabel(payload, buyers)} päivitetty käyttäjälle ${displayName}.` : `Uusi rooli ${buildRoleOptionLabel(payload, buyers)} lisätty käyttäjälle ${displayName}.`);
    setRefreshTick((prev) => prev + 1);
  };

  const handleDeleteOwnTestBuyerOffers = async () => {
    if (!profile?.id) return;
    const ownOfferCount = (buyerOffers || []).filter((offer) => String(offer?.seller_user_id || "") === String(profile.id)).length;
    if (!ownOfferCount) {
      setAuthInfo("Tällä käyttäjällä ei ole poistettavia testikauppoja.");
      return;
    }
    const ownerLabel = profile.company_name || profile.display_name || profile.email || "tuntematon käyttäjä";

    const confirmed = window.confirm(
      `Poistetaanko ${ownOfferCount} käyttäjän ${ownerLabel} tekemää tarjous-/kauppariviä? Tämä siivoaa testidatan ylläpidosta.`
    );
    if (!confirmed) return;

    setDeletingOwnTestBuyerOffers(true);
    setAuthError("");
    setAuthInfo("");
    try {
      const { error } = await supabase
        .from("buyer_offers")
        .delete()
        .eq("seller_user_id", profile.id);

      if (error) {
        if (isMissingRefreshTokenError(error)) {
          await invalidateSession();
          return;
        }
        throw error;
      }

      setAuthInfo(`${ownOfferCount} omaa testikauppaa poistettu ylläpidon näkymästä.`);
      setRefreshTick((prev) => prev + 1);
    } catch (error) {
      setAuthError(String(error?.message || error));
    } finally {
      setDeletingOwnTestBuyerOffers(false);
    }
  };

  const handleRequestAdditionalRole = async (requestedRole) => {
    if (!profile?.id) return;
    setAuthError("");
    setAuthInfo("");

    const normalizedEmail = normalizeEmail(profile.email || accountForm.contactEmail || "");
    if (!normalizedEmail) {
      setAuthError("Tililtä puuttuu sähköpostiosoite, joten lisäroolia ei voi pyytää.");
      return;
    }

    const role = requestedRole === "buyer" ? "buyer" : requestedRole === "processor" ? "processor" : "";
    if (!role) {
      setAuthError("Tuntematon roolipyyntö.");
      return;
    }

    if (role === "buyer" && hasBuyerRoleOption) {
      setAuthInfo("Sinulla on jo ostajarooli käytettävissä tällä sähköpostilla.");
      return;
    }

    if (role === "processor" && hasProcessorRoleOption) {
      setAuthInfo("Sinulla on jo jalostajarooli käytettävissä tällä sähköpostilla.");
      return;
    }

    const matchingBuyer = buyers.find((buyer) => normalizeEmail(buyer.email) === normalizedEmail) || null;
    if (role === "buyer" && !matchingBuyer) {
      setAuthError("Ostajaroolia ei voi avata automaattisesti, koska sähköpostille ei löytynyt liitettyä ostajayritystä. Pyydä ylläpitäjää lisäämään tai linkittämään ostajarekisterin yritys ensin.");
      return;
    }

    const requestPayload = {
      email: normalizedEmail,
      display_name: profile.display_name || accountForm.displayName || normalizedEmail,
      role,
      is_active: role === "buyer",
      buyer_id: role === "buyer" ? (matchingBuyer?.id || null) : null,
    };

    const { data: existingAllowedUsers, error: existingAllowedError } = await findAllowedUsersByEmail(supabase, normalizedEmail);
    if (existingAllowedError && existingAllowedError.code !== "PGRST116") {
      if (isMissingRefreshTokenError(existingAllowedError)) {
        await invalidateSession();
        return;
      }
      setAuthError(existingAllowedError.message);
      return;
    }

    const existingRequestedRole = (existingAllowedUsers || []).find((item) => item.role === role) || null;
    if (existingRequestedRole?.is_active) {
      setAuthInfo(
        role === "buyer"
          ? "Sinulle on jo lisätty ostajarooli. Kirjaudu ulos ja takaisin sisään tai vaihda roolia yläreunan valitsimesta."
          : "Sinulle on jo lisätty jalostajarooli. Kirjaudu ulos ja takaisin sisään tai vaihda roolia yläreunan valitsimesta."
      );
      return;
    }

    const result = existingRequestedRole
      ? await supabase.from("allowed_users").update(requestPayload).eq("id", existingRequestedRole.id)
      : await supabase.from("allowed_users").insert(requestPayload);

    if (result.error) {
      if (isMissingRefreshTokenError(result.error)) {
        await invalidateSession();
        return;
      }
      setAuthError(result.error.message);
      return;
    }

    setAuthInfo(
      role === "buyer"
        ? "Ostajarooli avattu. Kirjaudu ulos ja takaisin sisään tai vaihda roolia yläreunan valitsimesta."
        : "Jalostajaroolipyyntö lähetetty ylläpitäjälle hyväksyttäväksi."
    );
    setRefreshTick((prev) => prev + 1);
  };

  const resetBuyerForm = () => {
    const nextForm = {
      id: "",
      company_name: "",
      buyer_type: "ravintola",
      contact_name: "",
      email: "",
      phone: "",
      city: "",
      min_kg: "",
      max_kg: "",
      is_active: true,
      notes: "",
      delivery_address: "",
      delivery_postcode: "",
      delivery_city: "",
      billing_address: "",
      billing_postcode: "",
      billing_city: "",
      billing_email: "",
      business_id: "",
    };
    setBuyerForm(nextForm);
    setBuyerBillingSameAsDelivery(buyerBillingMatchesDelivery(nextForm));
  };

  const startEditBuyer = (buyer) => {
    const nextForm = {
      id: buyer.id,
      company_name: buyer.company_name || "",
      buyer_type: serializeBuyerTypes(buyer.buyer_type || "ravintola"),
      contact_name: buyer.contact_name || "",
      email: buyer.email || "",
      phone: buyer.phone || "",
      city: buyer.city || "",
      min_kg: getOptionalKgLimit(buyer.min_kg) == null ? "" : String(getOptionalKgLimit(buyer.min_kg)),
      max_kg: getOptionalKgLimit(buyer.max_kg) == null ? "" : String(getOptionalKgLimit(buyer.max_kg)),
      is_active: Boolean(buyer.is_active),
      notes: buyer.notes || "",
      delivery_address: buyer.delivery_address || "",
      delivery_postcode: buyer.delivery_postcode || "",
      delivery_city: buyer.delivery_city || "",
      billing_address: buyer.billing_address || "",
      billing_postcode: buyer.billing_postcode || "",
      billing_city: buyer.billing_city || "",
      billing_email: buyer.billing_email || "",
      business_id: buyer.business_id || "",
    };
    setBuyerForm(nextForm);
    setBuyerBillingSameAsDelivery(buyerBillingMatchesDelivery(nextForm));
    setUserMessage(`Muokataan ostajaa: ${buyer.company_name}`);
  };

  const toggleBuyerActive = async (buyer) => {
    const { error } = await supabase.from("buyers").update({ is_active: !buyer.is_active }).eq("id", buyer.id);
    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setUserMessage(error.message);
      return;
    }
    setRefreshTick((prev) => prev + 1);
  };

  const deleteBuyer = async (buyer) => {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(`Poistetaanko ostaja ${buyer.company_name || buyer.email} kokonaan?`);
      if (!confirmed) return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) {
      setUserMessage("Istunto puuttuu. Kirjaudu uudelleen sisään.");
      return;
    }

    const { error } = await invokeAdminDeleteEntity(accessToken, {
      type: "buyer",
      buyerId: buyer.id,
      email: buyer.email || "",
    });
    if (error) {
      if (error.status === 401) {
        await invalidateSession();
        return;
      }
      setUserMessage(`Ostajan poisto epäonnistui: ${error.message}`);
      return;
    }

    if (buyerForm.id === buyer.id) {
      resetBuyerForm();
    }
    setUserMessage(`Ostaja ${buyer.company_name || buyer.email} poistettu kokonaan.`);
    setRefreshTick((prev) => prev + 1);
  };

  const handleSaveBuyer = async () => {
    if (!profile || profile.role !== "owner") return;
    const normalizedBuyerMinKg = getOptionalKgLimit(buyerForm.min_kg);
    const normalizedBuyerMaxKg = getOptionalKgLimit(buyerForm.max_kg);
    if (
      normalizedBuyerMinKg != null &&
      normalizedBuyerMaxKg != null &&
      normalizedBuyerMinKg > normalizedBuyerMaxKg
    ) {
      setUserMessage("Min kg ei voi olla suurempi kuin Max kg.");
      return;
    }
    const payload = {
      company_name: buyerForm.company_name.trim(),
      buyer_type: serializeBuyerTypes(buyerForm.buyer_type),
      contact_name: buyerForm.contact_name.trim(),
      email: buyerForm.email.trim().toLowerCase(),
      phone: buyerForm.phone.trim(),
      city: buyerForm.city.trim(),
      min_kg: normalizedBuyerMinKg,
      max_kg: normalizedBuyerMaxKg,
      is_active: buyerForm.is_active,
      notes: buyerForm.notes.trim(),
      delivery_address: (buyerForm.delivery_address || "").trim(),
      delivery_postcode: (buyerForm.delivery_postcode || "").trim(),
      delivery_city: (buyerForm.delivery_city || "").trim(),
      billing_address: (buyerForm.billing_address || "").trim(),
      billing_postcode: (buyerForm.billing_postcode || "").trim(),
      billing_city: (buyerForm.billing_city || "").trim(),
      billing_email: (buyerForm.billing_email || "").trim().toLowerCase(),
      business_id: (buyerForm.business_id || "").trim(),
    };

    if (!payload.company_name || !payload.email) {
      setUserMessage("Täytä ostajalle vähintään yritys ja sähköposti.");
      return;
    }

    let error;
    let savedBuyer = null;
    if (buyerForm.id) {
      const result = await supabase.from("buyers").update(payload).eq("id", buyerForm.id).select("*").single();
      error = result.error;
      savedBuyer = result.data || null;
    } else {
      const result = await supabase.from("buyers").insert(payload).select("*").single();
      error = result.error;
      savedBuyer = result.data || null;
    }

    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setUserMessage(error.message);
      return;
    }

    const allowedPayload = {
      email: payload.email,
      display_name: payload.contact_name || payload.company_name,
      role: "buyer",
      is_active: Boolean(payload.is_active),
      buyer_id: savedBuyer?.id || buyerForm.id || null,
    };

    if (allowedPayload.buyer_id) {
      const [{ data: allowedByEmail, error: allowedByEmailError }, { data: allowedByBuyerId, error: allowedByBuyerIdError }] = await Promise.all([
        findAllowedUsersByEmail(supabase, allowedPayload.email),
        supabase.from("allowed_users").select("*").eq("role", "buyer").eq("buyer_id", allowedPayload.buyer_id),
      ]);

      const allowedLookupError = allowedByEmailError || allowedByBuyerIdError;
      if (allowedLookupError && allowedLookupError.code !== "PGRST116") {
        if (isMissingRefreshTokenError(allowedLookupError)) {
          await invalidateSession();
          return;
        }
        setUserMessage(`Ostaja tallennettiin, mutta buyer-roolin synkronointi epäonnistui: ${allowedLookupError.message}`);
        return;
      }

      const existingBuyerAllowedRow = [...(allowedByBuyerId || []), ...(allowedByEmail || [])]
        .find((row, index, rows) => (
          rows.findIndex((candidate) => String(candidate.id) === String(row.id)) === index &&
          row.role === "buyer" &&
          (
            String(row.buyer_id || "") === String(allowedPayload.buyer_id || "") ||
            normalizeEmail(row.email) === allowedPayload.email
          )
        )) || null;

      const allowedResult = existingBuyerAllowedRow
        ? await supabase.from("allowed_users").update(allowedPayload).eq("id", existingBuyerAllowedRow.id)
        : await supabase.from("allowed_users").insert(allowedPayload);

      if (allowedResult.error) {
        if (isMissingRefreshTokenError(allowedResult.error)) {
          await invalidateSession();
          return;
        }
        setUserMessage(`Ostaja tallennettiin, mutta buyer-roolin synkronointi epäonnistui: ${allowedResult.error.message}`);
        return;
      }
    }

    resetBuyerForm();
    setUserMessage(buyerForm.id ? "Ostajan tiedot päivitetty ja buyer-rooli synkronoitu käyttöoikeuksiin." : "Ostaja lisätty ja buyer-rooli tallennettu automaattisesti käyttöoikeuksiin.");
    setRefreshTick((prev) => prev + 1);
  };

  const toggleAllowedUserActive = async (row) => {
    const { error } = await supabase.from("allowed_users").update({ is_active: !row.is_active }).eq("id", row.id);
    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setUserMessage(error.message);
      return;
    }
    setRefreshTick((prev) => prev + 1);
  };

  const toggleFisherPremium = async (user, linkedProfile) => {
    if (!profile || profile.role !== "owner") return;

    const targetProfileId = linkedProfile?.id || null;
    if (!targetProfileId) {
      setUserMessage("Kalastajaprofiilia ei löytynyt premium-tilan vaihtamista varten.");
      return;
    }

    const nextValue = !Boolean(linkedProfile?.fisher_premium_enabled);
    const { error } = await supabase
      .from("profiles")
      .update({ fisher_premium_enabled: nextValue })
      .eq("id", targetProfileId);

    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setUserMessage(error.message);
      return;
    }

    setUserMessage(`Kalastajalisenssi ${nextValue ? "aktivoitu" : "poistettu"} käyttäjälle ${user.display_name || user.email}.`);
    setRefreshTick((prev) => prev + 1);
  };

  const handleApproveAllowedUser = async (row) => {
    if (!row?.id) return;

    let buyerId = row.buyer_id || null;
    if (row.role === "buyer" && !buyerId) {
      const normalizedEmail = normalizeEmail(row.email || "");
      const existingBuyer = buyers.find((buyer) => normalizeEmail(buyer.email) === normalizedEmail);
      if (existingBuyer) {
        buyerId = existingBuyer.id;
      } else {
        const buyerPayload = {
          company_name: row.display_name || normalizedEmail,
          buyer_type: "ravintola",
          contact_name: row.display_name || "",
          email: normalizedEmail,
          phone: "",
          city: "",
          is_active: true,
          notes: "Luotu roolipyynnön hyväksynnässä.",
          delivery_address: "",
          delivery_postcode: "",
          delivery_city: "",
          billing_address: "",
          billing_postcode: "",
          billing_city: "",
          billing_email: normalizedEmail,
          business_id: "",
        };
        const { data: insertedBuyer, error: buyerInsertError } = await supabase.from("buyers").insert(buyerPayload).select("id").single();
        if (buyerInsertError) {
          if (isMissingRefreshTokenError(buyerInsertError)) {
            await invalidateSession();
            return;
          }
          setUserMessage(buyerInsertError.message);
          return;
        }
        buyerId = insertedBuyer?.id || null;
      }
    }

    const { error } = await supabase
      .from("allowed_users")
      .update({ is_active: true, buyer_id: row.role === "buyer" ? buyerId : null })
      .eq("id", row.id);

    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setUserMessage(error.message);
      return;
    }

    setUserMessage(`Rooli ${roleLabel(row.role)} hyväksytty käyttäjälle ${row.display_name || row.email}.`);
    setRefreshTick((prev) => prev + 1);
  };

  const deleteAllowedUser = async (row) => {
    if (normalizeEmail(row.email) === normalizeEmail(profile?.email)) {
      setUserMessage("Et voi poistaa omaa käyttäjääsi sallittujen käyttäjien listasta.");
      return;
    }
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(`Poistetaanko käyttäjä ${row.display_name || row.email} kokonaan?`);
      if (!confirmed) return;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) {
      setUserMessage("Istunto puuttuu. Kirjaudu uudelleen sisään.");
      return;
    }

    const { error } = await invokeAdminDeleteEntity(accessToken, {
      type: "user",
      allowedUserId: row.id,
      email: row.email || "",
    });
    if (error) {
      if (error.status === 401) {
        await invalidateSession();
        return;
      }
      setUserMessage(error.message);
      return;
    }
    setUserMessage(`Käyttäjä ${row.display_name || row.email} poistettu kokonaan.`);
    setRefreshTick((prev) => prev + 1);
  };

  const BULK_OFFER_DISPATCH_THRESHOLD = 25;

  const tryBulkOfferDispatch = async ({
    accessToken,
    entry,
    recipients,
    offerInsertBase,
    pushNotification,
  }) => {
    const result = await invokeBulkOfferDispatch(accessToken, {
      entry,
      recipients,
      offerInsertBase,
      pushNotification,
    });

    if (result?.error) {
      const status = Number(result.error.status || 0);
      const message = String(result.error.message || "");
      const canFallbackSafely = status === 404 || status === 401 || status === 403 || message.includes("Failed to fetch");
      if (canFallbackSafely) {
        console.warn("bulk offer dispatch unavailable, falling back to legacy path", result.error);
        return null;
      }
      throw new Error(message || "Bulk-tarjouslähetys epäonnistui.");
    }

    return {
      skipped: false,
      sent: result?.data?.sent || [],
      failed: result?.data?.failed || [],
    };
  };

  const sendCatchOfferEmail = async ({ formState, rows, profileState }) => {
    const recipientAnalysis = analyzeOfferRecipients(formState, rows);
    const recipients = recipientAnalysis.matching.map((recipient) => ({
      ...recipient,
      email: (recipient.email || "").trim().toLowerCase(),
    }));
    if (recipients.length === 0) {
      return { skipped: true, sent: [], failed: [], recipientAnalysis };
    }

    const summaryLines = rows
      .map((row) => formatSpeciesOfferSummaryLine({ ...row, catch_date: formState.date }))
      .join(String.fromCharCode(10));

    const totalKilos = rows.reduce((sum, row) => sum + Number(row.kilos || 0), 0);
    const productTotal = getOfferProductTotal(rows);
    const selectedOriginPoint = getOriginPointById(formState.originPointId);
    const offerUrlBase = getPublicAppBaseUrl();
    const logisticsLines = [
      `Lähtöpaikka: ${formState.originCity || formState.municipality || "-"}`,
      `Kilpailuta kuljetus: ${formState.deliveryPossible ? "Kyllä" : "Ei"}`,
      `Toimitustapa: ${formState.deliveryMethod || "-"}`,
      formState.transportMode ? `Kuljetus järjestetään: ${getTransportModeLabel(formState.transportMode)}` : "",
      selectedOriginPoint ? `Luovutuspiste: ${selectedOriginPoint.name} / ${selectedOriginPoint.address}` : "",
      selectedOriginPoint?.latest_dropoff_time ? `Viimeinen jättöaika: ${selectedOriginPoint.latest_dropoff_time}` : "",
      formState.estimatedPickupTime ? `Arvioitu noutoaika: ${formState.estimatedPickupTime}` : "",
      formState.pickupSurcharge !== "" ? `Noutolisä: ${formState.pickupSurcharge} €` : "",
      Array.isArray(formState.deliveryDestinations) && formState.deliveryDestinations.length > 0 ? `Toimituskohteet: ${formState.deliveryDestinations.join(", ")}` : "",
      `Toimitusalue: ${formatDeliveryDestinations(formState.deliveryDestinations) || formState.deliveryArea || "-"}`,
      `Toimituskustannus: ${formState.deliveryCost !== "" ? `${formState.deliveryCost} €` : "-"}`,
      `Aikaisin toimitus: ${formState.earliestDeliveryDate || "-"}`,
      `Kylmäkuljetus: ${formState.coldTransport ? "Kyllä" : "Ei"}`,
      `Kaupallisen kalastajan tunnus: ${profileState?.commercial_fishing_id || "-"}`,
      `Paikkakunta: ${formState.municipality || "-"}`,
    ];

    const entry = {
      species: rows.map((row) => formatSpeciesForSale(getSpeciesRowLabel(row))).join(", "),
      kilos: totalKilos,
      line_items: rows.map((row) => ({
        species: formatSpeciesForSale(getSpeciesRowLabel(row)),
        kilos: Number(row.kilos || 0),
        count: Number(row.count || 0),
        price_per_kg: parseLocaleNumber(row.price_per_kg),
        price_unit: getSpeciesPriceUnit(getSpeciesRowLabel(row)),
        batch_id: row.batch_id || "",
        catch_date: formState.date || "",
      })),
      date: formState.date,
      dateLabel: "Pyyntipäivämäärä",
      area: formState.area,
      municipality: formState.municipality || "",
      originCity: formState.originCity || formState.municipality || "",
      spot: formState.spot || "",
      gear: formState.gear || "",
      price_per_kg: rows.length === 1 ? parseLocaleNumber(rows[0].price_per_kg) : null,
      productTotal,
      ownerName: profileState?.display_name || profileState?.email || "Tuntematon",
      commercialFishingId: profileState?.commercial_fishing_id || "",
      deliveryPossible: Boolean(formState.deliveryPossible),
      deliveryMethod: formState.deliveryMethod || "Nouto",
      transportMode: formState.transportMode || "",
      originPointId: formState.originPointId || "",
      transportCompanyId: formState.transportCompanyId || "",
      pickupSurcharge: formState.pickupSurcharge === "" ? null : Number(formState.pickupSurcharge),
      estimatedPickupTime: formState.estimatedPickupTime || "",
      deliveryDestinations: Array.isArray(formState.deliveryDestinations) ? formState.deliveryDestinations : [],
      deliveryArea: formatDeliveryDestinations(formState.deliveryDestinations) || formState.deliveryArea || "",
      deliveryCost: parseLocaleNumber(formState.deliveryCost),
      earliestDeliveryDate: formState.earliestDeliveryDate || "",
      coldTransport: Boolean(formState.coldTransport),
      notes: [formState.notes || "", "", "Erän lajit:", summaryLines, "", "Toimitus:", ...logisticsLines].join(String.fromCharCode(10)).trim(),
      offerUrlBase,
    };

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) {
      throw new Error("Istunto puuttuu. Kirjaudu ulos ja takaisin sisään ennen tarjouksen lähetystä.");
    }

    if (recipients.length >= BULK_OFFER_DISPATCH_THRESHOLD) {
      const bulkResult = await tryBulkOfferDispatch({
        accessToken,
        entry,
        recipients,
        offerInsertBase: {
          batch_id: rows[0]?.batch_id || null,
          seller_name: profileState?.display_name || profileState?.email || null,
          total_kilos: entry.kilos,
          price_per_kg: entry.price_per_kg,
          seller_origin_city: entry.originCity || null,
          delivery_possible: Boolean(entry.deliveryPossible),
          species_summary: summaryLines,
          area: entry.area,
          spot: entry.spot,
          gear: entry.gear,
          delivery_method: entry.deliveryMethod || "Nouto",
          transport_mode: entry.transportMode || null,
          origin_point_id: entry.originPointId || null,
          transport_company_id: entry.transportCompanyId || null,
          delivery_destinations: entry.deliveryDestinations,
          delivery_area: entry.deliveryArea || null,
          delivery_cost: entry.deliveryCost == null || entry.deliveryCost === "" ? null : Number(entry.deliveryCost),
          earliest_delivery_date: entry.earliestDeliveryDate || null,
          cold_transport: Boolean(entry.coldTransport),
          notes: entry.notes || null,
        },
        pushNotification: {
          title: "Uusi kalatarjous",
          body: `Sinulle on lähetetty uusi tarjous: ${buildPushEventHeadline({
            species_summary: summaryLines,
            total_kilos: entry.kilos,
            batch_id: rows[0]?.batch_id || "",
          })}.`,
          eventType: "offer_sent",
          route: "offers",
          batchId: rows[0]?.batch_id || "",
        },
      });
      if (bulkResult) {
        return { ...bulkResult, recipientAnalysis };
      }
    }

    const recipientResults = await runWithConcurrency(recipients, OFFER_SEND_CONCURRENCY, async (recipient) => {
      const insertedOffer = await supabase
        .from("buyer_offers")
        .insert({
          batch_id: rows[0]?.batch_id || null,
          buyer_id: recipient.buyer_id || null,
          buyer_email: recipient.email,
          seller_user_id: profileState?.id || null,
          seller_name: profileState?.display_name || profileState?.email || null,
          total_kilos: entry.kilos,
          price_per_kg: entry.price_per_kg,
          seller_origin_city: entry.originCity || null,
          delivery_possible: Boolean(entry.deliveryPossible),
          species_summary: summaryLines,
          area: entry.area,
          spot: entry.spot,
          gear: entry.gear,
          delivery_method: entry.deliveryMethod || "Nouto",
          transport_mode: entry.transportMode || null,
          origin_point_id: entry.originPointId || null,
          transport_company_id: recipient.carrier_id || entry.transportCompanyId || null,
          delivery_destination_city: recipient.destination_city || null,
          delivery_destinations: entry.deliveryDestinations,
          route_price_eur: recipient.route_price_eur == null || recipient.route_price_eur === "" ? null : Number(recipient.route_price_eur),
          total_price_eur: recipient.total_price_eur == null || recipient.total_price_eur === "" ? null : Number(recipient.total_price_eur),
          delivered_price_per_kg: recipient.delivered_price_per_kg == null || recipient.delivered_price_per_kg === "" ? null : Number(recipient.delivered_price_per_kg),
          delivery_area: entry.deliveryArea || null,
          delivery_cost: entry.deliveryCost == null || entry.deliveryCost === "" ? null : Number(entry.deliveryCost),
          earliest_delivery_date: entry.earliestDeliveryDate || null,
          cold_transport: Boolean(entry.coldTransport),
          notes: entry.notes || null,
          status: "sent",
          billing_status: "unbilled",
          owner_commission_status: "unbilled",
        })
        .select("id")
        .single();

      if (insertedOffer.error) {
        return {
          kind: "failed",
          payload: {
          company_name: recipient.company_name,
          contact_name: recipient.contact_name,
          email: recipient.email,
          channel: recipient.channel,
          error: insertedOffer.error.message || "buyer_offers-rivin tallennus epäonnistui",
          },
        };
      }

      const offerId = insertedOffer?.data?.id || null;

      try {
        const { data, error } = await invokeEdgeFunctionAuthenticated(
          "send-catch-offer-email",
          {
            entry,
            recipients: [{
              email: recipient.email,
              company_name: recipient.company_name,
              offer_id: offerId,
              offer_link: offerId ? `${offerUrlBase}?offer=${offerId}` : null,
              delivery_destination_city: recipient.destination_city || "",
              route_price_eur: recipient.route_price_eur,
              total_price_eur: recipient.total_price_eur,
              delivered_price_per_kg: recipient.delivered_price_per_kg,
              carrier_name: recipient.carrier_name || "",
            }],
          },
          accessToken
        );

        console.log("Invoke result", { data, error });

        if (data?.results) {
          console.log("Function results", data.results);
        }

        const functionFailure = Array.isArray(data?.results)
          ? data.results.find((result) => result?.ok === false)
          : null;
        const emailErrorMessage =
          describeOfferEmailError(functionFailure?.error) ||
          describeOfferEmailError(error?.context?.error) ||
          describeOfferEmailError(error);
        const emailSucceeded = !error && !functionFailure && data?.ok !== false;

        let pushResult = null;
        let pushErrorMessage = "";
        if (recipient.buyer_id) {
          try {
            pushResult = await sendPushEvent({
              targetBuyerId: recipient.buyer_id || "",
              targetBuyerEmail: recipient.email || "",
              title: "Uusi kalatarjous",
              body: `Sinulle on lähetetty uusi tarjous: ${buildPushEventHeadline({
                species_summary: summaryLines,
                total_kilos: entry.kilos,
                batch_id: rows[0]?.batch_id || "",
              })}.`,
              eventType: "offer_sent",
              route: "offers",
              offerId,
              batchId: rows[0]?.batch_id || "",
            });
          } catch (pushError) {
            pushErrorMessage = pushError instanceof Error ? pushError.message : String(pushError);
          }
        }

        const pushSkipped = Boolean(pushResult?.data?.skipped);
        const pushSkipReason = String(pushResult?.data?.reason || "").trim();
        const pushDelivered = Boolean(recipient.buyer_id) && !pushSkipped && !pushErrorMessage;

        if (emailSucceeded || pushDelivered) {
          return {
            kind: "sent",
            payload: {
            buyer_id: recipient.buyer_id,
            company_name: recipient.company_name,
            contact_name: recipient.contact_name,
            email: recipient.email,
            channel: recipient.channel,
            offer_id: offerId,
            offer_link: offerId ? `${offerUrlBase}?offer=${offerId}` : null,
            pushSkipped,
            pushSkipReason,
            emailFailed: !emailSucceeded,
            emailError: emailSucceeded ? "" : emailErrorMessage,
            data,
            },
          };
        } else {
          return {
            kind: "failed",
            payload: {
            company_name: recipient.company_name,
            contact_name: recipient.contact_name,
            email: recipient.email,
            channel: recipient.channel,
            error: emailErrorMessage || pushErrorMessage || "Tarjouksen ilmoitusten lähetys epäonnistui",
            },
          };
        }
      } catch (err) {
        return {
          kind: "failed",
          payload: {
          company_name: recipient.company_name,
          contact_name: recipient.contact_name,
          email: recipient.email,
          channel: recipient.channel,
          error: err instanceof Error ? err.message : String(err),
          },
        };
      }
    });

    const sent = recipientResults
      .filter((result) => result?.kind === "sent")
      .map((result) => result.payload);
    const failed = recipientResults
      .filter((result) => result?.kind === "failed")
      .map((result) => result.payload);

    if (failed.length > 0 && sent.length === 0) {
      throw new Error(`Tarjouksen lähetys epäonnistui ${failed.length} ostajalle.`);
    }

    return { skipped: false, sent, failed, recipientAnalysis };
  };

  const sendCatchOfferEmail_OLD = async ({ formState, rows, profileState, batchId }) => {
    const recipients = buildOfferRecipients(formState, rows).map((recipient) => ({
      ...recipient,
      email: (recipient.email || "").trim().toLowerCase(),
    }));
    if (recipients.length === 0) {
      return { skipped: true, sent: [], failed: [] };
    }

    const summaryLines = rows
      .map((row) => {
        const kilos = Number(row.kilos || 0);
        const count = Number(row.count || 0);
        return formatSpeciesSummaryLine(row.species, kilos, count);
      })
      .join(String.fromCharCode(10));

    const totalKilos = rows.reduce((sum, row) => sum + Number(row.kilos || 0), 0);
    const offerUrlBase = getPublicAppBaseUrl();
    const logisticsLines = [
      `Hinta: ${formState.price_per_kg !== "" && formState.price_per_kg != null ? `${formState.price_per_kg} € / kg` : "-"}`,
      `Toimitustapa: ${formState.deliveryMethod || "-"}`,
      `Toimitusalue: ${formatDeliveryDestinations(formState.deliveryDestinations) || formState.deliveryArea || "-"}`,
      `Toimituskustannus: ${formState.deliveryCost !== "" ? `${formState.deliveryCost} €` : "-"}`,
      `Aikaisin toimitus: ${formState.earliestDeliveryDate || "-"}`,
      `Kylmäkuljetus: ${formState.coldTransport ? "Kyllä" : "Ei"}`,
      `Kaupallisen kalastajan tunnus: ${profileState?.commercial_fishing_id || "-"}`,
      `Paikkakunta: ${formState.municipality || "-"}`,
    ];

    const entry = {
      species: rows.map((row) => formatSpeciesForSale(row.species)).join(", "),
      kilos: totalKilos,
      date: formState.date,
      dateLabel: "Pyyntipäivämäärä",
      area: formState.area,
      municipality: formState.municipality || "",
      spot: formState.spot || "",
      gear: formState.gear || "",
      price_per_kg: parseLocaleNumber(formState.price_per_kg),
      ownerName: profileState?.display_name || profileState?.email || "Tuntematon",
      commercialFishingId: profileState?.commercial_fishing_id || "",
      deliveryMethod: formState.deliveryMethod || "Nouto",
      deliveryArea: formatDeliveryDestinations(formState.deliveryDestinations) || formState.deliveryArea || "",
      deliveryCost: parseLocaleNumber(formState.deliveryCost),
      earliestDeliveryDate: formState.earliestDeliveryDate || "",
      coldTransport: Boolean(formState.coldTransport),
      notes: [formState.notes || "", "", "Erän lajit:", summaryLines, "", "Toimitus:", ...logisticsLines].join(String.fromCharCode(10)).trim(),
      offerUrlBase,
    };

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    if (!accessToken) {
      throw new Error("Istunto puuttuu. Kirjaudu ulos ja takaisin sisään ennen tarjouksen lähetystä.");
    }

    if (recipients.length >= BULK_OFFER_DISPATCH_THRESHOLD) {
      const bulkResult = await tryBulkOfferDispatch({
        accessToken,
        entry: {
          species: formState.productName || formState.productType || "Jaloste-erä",
          kilos: Number(formState.kilos || 0),
          date: formState.productionDate,
          area: formState.area,
          municipality: formState.municipality || "",
          spot: formState.spot || "",
          gear: `Jaloste / ${formState.processingMethod || formState.productType || "-"}`,
          notes: [summaryLines, "", notes].join(String.fromCharCode(10)).trim(),
          offerUrlBase,
        },
        recipients,
        offerInsertBase: {
          batch_id: batchId,
          seller_name: profileState?.display_name || profileState?.email || null,
          total_kilos: Number(formState.kilos || 0),
          seller_origin_city: formState.originCity || formState.municipality || null,
          delivery_possible: Boolean(formState.deliveryPossible),
          species_summary: summaryLines,
          area: formState.area,
          spot: formState.spot,
          gear: `Jaloste / ${formState.processingMethod || formState.productType || "-"}`,
          delivery_method: formState.deliveryMethod || "Nouto",
          transport_mode: formState.transportMode || null,
          origin_point_id: formState.originPointId || null,
          transport_company_id: formState.transportCompanyId || null,
          delivery_destinations: formState.deliveryDestinations || [],
          delivery_area: formatDeliveryDestinations(formState.deliveryDestinations) || formState.deliveryArea || null,
          delivery_cost: formState.deliveryCost === "" ? null : Number(formState.deliveryCost),
          earliest_delivery_date: formState.earliestDeliveryDate || null,
          cold_transport: Boolean(formState.coldTransport),
          notes,
        },
        pushNotification: {
          title: "Uusi kalatarjous",
          body: `Sinulle on lähetetty uusi tarjous: ${formState.productName || formState.productType || "Jaloste-erä"}.`,
          eventType: "offer_sent",
          route: "offers",
          batchId,
        },
      });
      if (bulkResult) {
        return { ...bulkResult, recipientAnalysis };
      }
    }

    const sent = [];
    const failed = [];

    for (const recipient of recipients) {
      const insertedOffer = await supabase
        .from("buyer_offers")
      .insert({
          batch_id: batchId,
          buyer_id: recipient.buyer_id || null,
          buyer_email: recipient.email,
          seller_user_id: profileState?.id || null,
          seller_name: profileState?.display_name || profileState?.email || null,
          total_kilos: entry.kilos,
          species_summary: summaryLines,
          area: entry.area,
          spot: entry.spot,
          gear: entry.gear,
          notes: entry.notes || null,
          status: "sent",
          billing_status: "unbilled",
          owner_commission_status: "unbilled",
        })
        .select("id")
        .single();

      if (insertedOffer.error) {
        failed.push({
          company_name: recipient.company_name,
          contact_name: recipient.contact_name,
          email: recipient.email,
          channel: recipient.channel,
          error: insertedOffer.error.message || "buyer_offers-rivin tallennus epäonnistui",
        });
        continue;
      }

      const offerId = insertedOffer?.data?.id || null;

      const { data, error } = await invokeEdgeFunctionAuthenticated(
        "send-catch-offer-email",
        {
          entry,
          recipients: [{
            email: recipient.email,
            company_name: recipient.company_name,
            offer_id: offerId,
            offer_link: offerId ? `${offerUrlBase}?offer=${offerId}` : null,
          }],
        },
        accessToken,
      );
      const functionFailure = Array.isArray(data?.results)
        ? data.results.find((result) => result?.ok === false)
        : null;

      if (!error && !functionFailure && data?.ok !== false) {
        console.log("send-catch-offer-email ok", recipient.email, data);
        sent.push({
          buyer_id: recipient.buyer_id,
          company_name: recipient.company_name,
          contact_name: recipient.contact_name,
          email: recipient.email,
          channel: recipient.channel,
          offer_id: offerId,
          offer_link: offerId ? `${offerUrlBase}?offer=${offerId}` : null,
          data,
        });
      } else {
        console.error("send-catch-offer-email error", recipient.email, error || functionFailure || data);
        failed.push({
          company_name: recipient.company_name,
          contact_name: recipient.contact_name,
          email: recipient.email,
          channel: recipient.channel,
          error:
            describeOfferEmailError(functionFailure?.error) ||
            describeOfferEmailError(error?.context?.error) ||
            describeOfferEmailError(error),
        });
      }
    }

    if (failed.length > 0 && sent.length === 0) {
      throw new Error(`Tarjouksen lähetys epäonnistui ${failed.length} ostajalle.`);
    }

    return { skipped: false, sent, failed };
  };

  const refreshBuyerOffers = async () => {
    const query = profile?.role === "buyer"
      ? (() => {
          const buyerQuery = supabase
            .from("buyer_offers")
            .select("*")
            .in("status", ["sent", "viewed", "countered", "reserved", "accepted", "rejected", "expired", "cancelled"])
            .order("created_at", { ascending: false });
          return buyerOfferIdentityFilters.length > 0
            ? buyerQuery.or(buyerOfferIdentityFilters.join(","))
            : buyerQuery.eq("buyer_email", normalizeEmail(profile?.email));
        })()
      : supabase.from("buyer_offers").select("*").order("created_at", { ascending: false });

    const { data, error } = await query;
    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setAuthError(error.message);
      return;
    }

    const sellerIds = Array.from(new Set((data || []).map((offer) => offer.seller_user_id).filter(Boolean)));
    let sellerProfileMap = {};
    if (sellerIds.length > 0) {
      const { data: sellerProfiles, error: sellerProfilesError } = await supabase
        .from("profiles")
        .select("id, email, phone, company_name, display_name, business_id, address, postcode, city, contact_email, commercial_fishing_id")
        .in("id", sellerIds);

      if (sellerProfilesError) {
        if (isMissingRefreshTokenError(sellerProfilesError)) {
          await invalidateSession();
          return;
        }
        setAuthError(sellerProfilesError.message);
        return;
      }

      sellerProfileMap = Object.fromEntries(
        (sellerProfiles || []).map((item) => [
          item.id,
          {
            email: item.email || "",
            phone: item.phone || "",
            companyName: item.company_name || "",
            displayName: item.display_name || "",
            businessId: item.business_id || "",
            address: item.address || "",
            postcode: item.postcode || "",
            city: item.city || "",
            contactEmail: item.contact_email || "",
            commercialFishingId: item.commercial_fishing_id || "",
          },
        ]),
      );
    }

    setBuyerOffers((data || []).map((offer) => {
      const buyer = buyers.find((item) => item.id === offer.buyer_id || item.email === (offer.buyer_email || "").toLowerCase());
      const sellerProfile = sellerProfileMap[offer.seller_user_id] || {};
      return {
        ...offer,
        buyer_email: (offer.buyer_email || "").toLowerCase(),
        total_kilos: Number(offer.total_kilos || 0),
        price_per_kg: offer.price_per_kg == null ? "" : Number(offer.price_per_kg),
        counter_price_per_kg: offer.counter_price_per_kg == null ? "" : Number(offer.counter_price_per_kg),
        reserved_kilos: offer.reserved_kilos == null ? "" : Number(offer.reserved_kilos),
        delivery_method: offer.delivery_method || "Nouto",
        delivery_possible: Boolean(offer.delivery_possible),
        transport_mode: offer.transport_mode || "",
        origin_point_id: offer.origin_point_id || "",
        transport_company_id: offer.transport_company_id || "",
        seller_origin_city: offer.seller_origin_city || "",
        delivery_destination_city: offer.delivery_destination_city || "",
        route_price_eur: offer.route_price_eur == null ? "" : Number(offer.route_price_eur),
        total_price_eur: offer.total_price_eur == null ? "" : Number(offer.total_price_eur),
        delivered_price_per_kg: offer.delivered_price_per_kg == null ? "" : Number(offer.delivered_price_per_kg),
        delivery_destinations: Array.isArray(offer.delivery_destinations) ? offer.delivery_destinations : [],
        delivery_area: offer.delivery_area || "",
        delivery_cost: offer.delivery_cost == null ? "" : Number(offer.delivery_cost),
        earliest_delivery_date: offer.earliest_delivery_date || "",
        cold_transport: Boolean(offer.cold_transport),
        buyer_type: buyer?.buyer_type || "",
        buyer_company_name: buyer?.company_name || "",
        buyer_contact_name: buyer?.contact_name || "",
        buyer_phone: buyer?.phone || "",
        sellerEmail: sellerProfile.email || "",
        sellerPhone: sellerProfile.phone || "",
        sellerCompanyNameFallback: sellerProfile.companyName || "",
        sellerDisplayNameFallback: sellerProfile.displayName || "",
        sellerBusinessIdFallback: sellerProfile.businessId || "",
        sellerAddressFallback: sellerProfile.address || "",
        sellerPostcodeFallback: sellerProfile.postcode || "",
        sellerCityFallback: sellerProfile.city || "",
        sellerContactEmailFallback: sellerProfile.contactEmail || "",
        sellerCommercialFishingIdFallback: sellerProfile.commercialFishingId || "",
        seller_bank_account_iban: offer.seller_bank_account_iban || "",
        seller_bank_bic: offer.seller_bank_bic || "",
        fulfillment_status: offer.fulfillment_status || (offer.status === "accepted" ? "awaiting_contact" : ""),
      };
    }));
  };

  const buildOwnerCommissionStatusPatch = (offer, billingStatus) => ({
    owner_commission_status: billingStatus,
    owner_commission_billed_at: billingStatus === "unbilled"
      ? null
      : offer.owner_commission_billed_at || new Date().toISOString(),
    owner_commission_paid_at: billingStatus === "paid" ? new Date().toISOString() : null,
    owner_commission_month: offer.owner_commission_month || offer.billing_month || (() => {
      try {
        const d = new Date(offer.updated_at || offer.created_at || new Date().toISOString());
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      } catch {
        return "";
      }
    })(),
    owner_commission_rate: COMMISSION_RATE,
    owner_trade_value: calculateCommissionDetails(offer).tradeValue,
    owner_commission_amount: calculateCommissionDetails(offer).commissionValue,
  });

  const buildSellerBillingStatusPatch = (offer, billingStatus) => ({
    billing_status: billingStatus,
    billed_at: billingStatus === "unbilled"
      ? null
      : offer.billed_at || new Date().toISOString(),
    paid_at: billingStatus === "paid" ? new Date().toISOString() : null,
    billing_month: offer.billing_month || getOfferBillingMonthValue(offer) || (() => {
      try {
        const d = new Date(offer.updated_at || offer.created_at || new Date().toISOString());
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      } catch {
        return "";
      }
    })(),
  });

  const handleUpdateOwnerCommissionStatus = async (offer, billingStatus) => {
    const patch = buildOwnerCommissionStatusPatch(offer, billingStatus);

    const { error } = await supabase.from("buyer_offers").update(patch).eq("id", offer.id);
    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setAuthError(error.message);
      return;
    }

    setAuthInfo(
      billingStatus === "paid"
        ? "Komissio merkitty maksetuksi."
        : billingStatus === "invoiced"
        ? "Komissio merkitty laskutetuksi."
        : "Komissio palautettu laskuttamattomaksi."
    );
    setRefreshTick((prev) => prev + 1);
  };

  const handleUpdateOwnerCommissionGroupStatus = async (offers, billingStatus) => {
    const targetOffers = Array.isArray(offers) ? offers.filter(Boolean) : [];
    if (targetOffers.length === 0) return;

    for (const offer of targetOffers) {
      const patch = buildOwnerCommissionStatusPatch(offer, billingStatus);
      const { error } = await supabase.from("buyer_offers").update(patch).eq("id", offer.id);
      if (error) {
        if (isMissingRefreshTokenError(error)) {
          await invalidateSession();
          return;
        }
        setAuthError(error.message);
        return;
      }
    }

    setAuthInfo(
      billingStatus === "paid"
        ? "Kaikki ryhmän komissiot merkitty maksetuiksi."
        : billingStatus === "invoiced"
        ? "Kaikki ryhmän komissiot merkitty laskutetuiksi."
        : "Kaikki ryhmän komissiot palautettu laskuttamattomiksi."
    );
    setRefreshTick((prev) => prev + 1);
  };

  const handleUpdateSellerBillingStatus = async (offer, billingStatus) => {
    const patch = buildSellerBillingStatusPatch(offer, billingStatus);

    const { error } = await supabase.from("buyer_offers").update(patch).eq("id", offer.id);
    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setAuthError(error.message);
      return;
    }

    setAuthInfo(
      billingStatus === "paid"
        ? "Lasku merkitty maksetuksi."
        : billingStatus === "invoiced"
        ? "Lasku merkitty laskutetuksi."
        : "Lasku palautettu laskuttamattomaksi."
    );
    setRefreshTick((prev) => prev + 1);
  };

  const handleUpdateSellerGroupBillingStatus = async (offers, billingStatus) => {
    const targetOffers = Array.isArray(offers) ? offers.filter(Boolean) : [];
    if (targetOffers.length === 0) return;

    for (const offer of targetOffers) {
      const patch = buildSellerBillingStatusPatch(offer, billingStatus);
      const { error } = await supabase.from("buyer_offers").update(patch).eq("id", offer.id);
      if (error) {
        if (isMissingRefreshTokenError(error)) {
          await invalidateSession();
          return;
        }
        setAuthError(error.message);
        return;
      }
    }

    setAuthInfo(
      billingStatus === "paid"
        ? "Kaikki ryhmän laskut merkitty maksetuiksi."
        : billingStatus === "invoiced"
        ? "Kaikki ryhmän laskut merkitty laskutetuiksi."
        : "Kaikki ryhmän laskut palautettu laskuttamattomiksi."
    );
    setRefreshTick((prev) => prev + 1);
  };

  const handleOpenSellerInvoicePdf = async (offer) => {
    if (!profile?.bank_account_iban) {
      setAuthError("Lisää IBAN pankkitietoihin ennen lasku-PDF:n muodostamista.");
      return;
    }
    setAuthError("");
    await buildSellerInvoicePdf(offer, profile, offer?.billing_status === "invoiced" ? "reminder" : "invoice");
  };

  const handleViewSellerInvoicePdf = async (offer) => {
    if (!profile?.bank_account_iban) {
      setAuthError("Lisää IBAN pankkitietoihin ennen lasku-PDF:n avaamista.");
      return;
    }
    setAuthError("");
    await openSellerInvoicePdf(offer, profile);
  };

  const handleOpenBuyerInvoicePdf = async (offer) => {
    const sellerProfileLike = {
      company_name: offer?.seller_name || offer?.seller_company_name || offer?.sellerCompanyNameFallback || "",
      display_name: offer?.seller_name || offer?.sellerDisplayNameFallback || "",
      business_id: offer?.seller_business_id || offer?.sellerBusinessIdFallback || "",
      address: offer?.seller_address || offer?.sellerAddressFallback || "",
      postcode: offer?.seller_postcode || offer?.sellerPostcodeFallback || "",
      city: offer?.seller_city || offer?.sellerCityFallback || "",
      contact_email: offer?.seller_contact_email || offer?.sellerContactEmailFallback || offer?.seller_email || offer?.sellerEmail || "",
      email: offer?.seller_email || offer?.sellerEmail || offer?.seller_contact_email || offer?.sellerContactEmailFallback || "",
      phone: offer?.seller_phone || offer?.sellerPhone || "",
      bank_account_iban: offer?.seller_bank_account_iban || "",
      bank_bic: offer?.seller_bank_bic || "",
    };

    if (!sellerProfileLike.bank_account_iban) {
      setAuthError("Laskun PDF ei ole vielä saatavilla tälle kaupalle, koska kalastajan tilinumero puuttuu laskutiedoista.");
      return;
    }

    setAuthError("");
    try {
      await openSellerInvoicePdf(offer, sellerProfileLike);
    } catch (error) {
      setAuthError(`Lasku-PDF:n avaaminen epäonnistui: ${String(error?.message || error)}`);
    }
  };

  const sendSellerInvoiceEmailMessage = async ({
    recipientEmail,
    recipientName,
    invoiceNumber,
    referenceNumber,
    sellerName,
    buyerName,
    totalAmount,
    dueDate,
    documentKind,
    fileName,
    pdfBase64,
    accessToken,
    emailMode = "buyer",
  }) => invokeEdgeFunctionAuthenticated("send-seller-invoice-email", {
    invoiceEmail: recipientEmail,
    recipientName,
    invoiceNumber,
    referenceNumber,
    sellerName,
    buyerName,
    totalAmount,
    dueDate,
    documentKind,
    fileName,
    pdfBase64,
    emailMode,
  }, accessToken);

  const sendSellerInvoiceCopies = async (attachment, accessToken) => {
    const { recipients, skipped } = buildInvoiceCopyRecipientTargets({
      buyerEmail: attachment.invoice.buyerBillingEmail,
      selfEmail: accountForm.contactEmail || profile?.contact_email || profile?.email || "",
      accountantEmail: accountForm.accountantEmail || "",
      sellerName: attachment.invoice.sellerName || profile?.display_name || "Kalastaja",
      sendToSelf: sendInvoiceCopyToSelf,
      sendToAccountant: sendInvoiceCopyToAccountant,
    });
    const sentLabels = [];
    const failedLabels = [];

    for (const recipient of recipients) {
      const { error } = await sendSellerInvoiceEmailMessage({
        recipientEmail: recipient.email,
        recipientName: recipient.recipientName,
        invoiceNumber: attachment.invoice.invoiceNumber,
        referenceNumber: attachment.invoice.referenceDisplay,
        sellerName: attachment.invoice.sellerName,
        buyerName: attachment.invoice.buyerName,
        totalAmount: euro(attachment.invoice.grandTotal),
        dueDate: attachment.invoice.dueDate,
        documentKind: attachment.documentKind,
        fileName: attachment.fileName,
        pdfBase64: attachment.pdfBase64,
        accessToken,
        emailMode: "copy",
      });
      if (error) {
        if (isMissingRefreshTokenError(error)) {
          await invalidateSession();
          return { authInvalidated: true, statusText: "" };
        }
        failedLabels.push(recipient.label);
      } else {
        sentLabels.push(recipient.label);
      }
    }

    return {
      authInvalidated: false,
      statusText: buildInvoiceCopyStatusText({
        sentLabels,
        failedLabels,
        skippedLabels: skipped,
      }),
    };
  };

  const handleSendSellerInvoicePdf = async (offer) => {
    if (!profile?.bank_account_iban) {
      setAuthError("Lisää IBAN pankkitietoihin ennen laskun lähettämistä.");
      return;
    }

    const documentKind = offer?.billing_status === "invoiced" ? "reminder" : "invoice";
    const attachment = await buildSellerInvoiceEmailAttachment(offer, profile, documentKind);
    if (!attachment.invoice.buyerBillingEmail) {
      setAuthError("Ostajalle ei ole tallennettu laskutussähköpostia.");
      return;
    }
    if (!attachment.pdfBase64) {
      setAuthError("Lasku-PDF:n muodostus epäonnistui.");
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    const { error } = await sendSellerInvoiceEmailMessage({
      recipientEmail: attachment.invoice.buyerBillingEmail,
      recipientName: attachment.invoice.buyerName,
      invoiceNumber: attachment.invoice.invoiceNumber,
      referenceNumber: attachment.invoice.referenceDisplay,
      sellerName: attachment.invoice.sellerName,
      buyerName: attachment.invoice.buyerName,
      totalAmount: euro(attachment.invoice.grandTotal),
      dueDate: attachment.invoice.dueDate,
      documentKind,
      fileName: attachment.fileName,
      pdfBase64: attachment.pdfBase64,
      accessToken,
      emailMode: "buyer",
    });

    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setAuthError(error.message || "Laskun lähetys epäonnistui.");
      return;
    }

    const copyResult = await sendSellerInvoiceCopies(attachment, accessToken);
    if (copyResult.authInvalidated) return;

    if (documentKind === "invoice") {
      await handleUpdateSellerBillingStatus(offer, "invoiced");
      await sendPushEvent({
        targetBuyerId: offer?.buyer_id || "",
        title: "Uusi lasku",
        body: `${offer?.seller_name || "Myyjä"} lähetti laskun kaupasta ${buildPushEventHeadline(offer)}.`,
        eventType: "invoice_sent",
        route: "billing",
        offerId: offer?.id,
        batchId: offer?.batch_id,
      });
      setAuthInfo(`Lasku ${attachment.invoice.invoiceNumber} lähetetty asiakkaalle PDF-liitteenä.${copyResult.statusText}`);
      return;
    }

    await sendPushEvent({
      targetBuyerId: offer?.buyer_id || "",
      title: "Maksumuistutus",
      body: `${offer?.seller_name || "Myyjä"} lähetti maksumuistutuksen kaupasta ${buildPushEventHeadline(offer)}.`,
      eventType: "payment_reminder_sent",
      route: "billing",
      offerId: offer?.id,
      batchId: offer?.batch_id,
    });
    setAuthInfo(`Maksumuistutus ${attachment.invoice.invoiceNumber} lähetetty asiakkaalle PDF-liitteenä.${copyResult.statusText}`);
  };

  const handleOpenSellerGroupInvoicePdf = async (offers) => {
    if (!profile?.bank_account_iban) {
      setAuthError("Lisää IBAN pankkitietoihin ennen koontilasku-PDF:n muodostamista.");
      return;
    }
    setAuthError("");
    const currentStatus = String(offers?.[0]?.billing_status || "unbilled");
    await buildSellerGroupInvoicePdf(offers, profile, currentStatus === "invoiced" ? "reminder" : "invoice");
  };

  const handleViewSellerGroupInvoicePdf = async (offers) => {
    if (!profile?.bank_account_iban) {
      setAuthError("Lisää IBAN pankkitietoihin ennen koontilasku-PDF:n avaamista.");
      return;
    }
    setAuthError("");
    await openSellerGroupInvoicePdf(offers, profile);
  };

  const handleSendSellerGroupInvoicePdf = async (offers) => {
    if (!profile?.bank_account_iban) {
      setAuthError("Lisää IBAN pankkitietoihin ennen koontilaskun lähettämistä.");
      return;
    }
    const currentStatus = String(offers?.[0]?.billing_status || "unbilled");
    const documentKind = currentStatus === "invoiced" ? "reminder" : "invoice";
    const attachment = await buildSellerGroupInvoiceEmailAttachment(offers, profile, documentKind);
    if (!attachment.invoice.buyerBillingEmail) {
      setAuthError("Ostajalle ei ole tallennettu laskutussähköpostia.");
      return;
    }
    if (!attachment.pdfBase64) {
      setAuthError("Koontilasku-PDF:n muodostus epäonnistui.");
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    const { error } = await sendSellerInvoiceEmailMessage({
      recipientEmail: attachment.invoice.buyerBillingEmail,
      recipientName: attachment.invoice.buyerName,
      invoiceNumber: attachment.invoice.invoiceNumber,
      referenceNumber: attachment.invoice.referenceDisplay,
      sellerName: attachment.invoice.sellerName,
      buyerName: attachment.invoice.buyerName,
      totalAmount: euro(attachment.invoice.grandTotal),
      dueDate: attachment.invoice.dueDate,
      documentKind,
      fileName: attachment.fileName,
      pdfBase64: attachment.pdfBase64,
      accessToken,
      emailMode: "buyer",
    });

    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setAuthError(error.message || "Koontilaskun lähetys epäonnistui.");
      return;
    }

    const copyResult = await sendSellerInvoiceCopies(attachment, accessToken);
    if (copyResult.authInvalidated) return;

    if (documentKind === "invoice") {
      await handleUpdateSellerGroupBillingStatus(offers, "invoiced");
      setAuthInfo(`Koontilasku ${attachment.invoice.invoiceNumber} lähetetty asiakkaalle PDF-liitteenä.${copyResult.statusText}`);
      return;
    }

    setAuthInfo(`Koontimaksumuistutus ${attachment.invoice.invoiceNumber} lähetetty asiakkaalle PDF-liitteenä.${copyResult.statusText}`);
  };

  const updateFulfillmentStatusFallback = async (offer, fulfillmentStatus) => {
    const { error } = await supabase
      .from("buyer_offers")
      .update({ fulfillment_status: fulfillmentStatus })
      .eq("id", offer.id);

    if (error) return { ok: false, error };
    return { ok: true };
  };

  const buyerUpdateOfferFallback = async (offerId, patch) => {
    const { error } = await supabase.from("buyer_offers").update(patch).eq("id", offerId);
    if (error) return { ok: false, error };
    return { ok: true };
  };

  const runBuyerOfferMutation = async ({ action, offer, payload, fallbackPatch, skipRefresh = false, applyLocalOfferUpdate = null }) => {
    let result = null;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (accessToken) {
        result = await invokeBuyerOfferAction(accessToken, {
          action,
          offerId: offer.id,
          ...payload,
        });
      }
    } catch (error) {
      console.warn("buyer-offer-action invocation failed, falling back to direct update", {
        action,
        offerId: offer?.id,
        message: String(error?.message || error),
      });
    }

    if (result?.error) {
      console.warn("buyer-offer-action returned error, falling back to direct update", {
        action,
        offerId: offer?.id,
        message: result.error.message,
      });
    }

    if (result && !result.error) {
      if (skipRefresh) {
        if (typeof applyLocalOfferUpdate === "function") {
          applyLocalOfferUpdate();
        }
      } else {
        await refreshBuyerOffers();
        setRefreshTick((prev) => prev + 1);
      }
      return true;
    }

    const fallbackResult = action === "update_fulfillment"
      ? await updateFulfillmentStatusFallback(offer, payload.fulfillmentStatus)
      : await buyerUpdateOfferFallback(offer.id, fallbackPatch);

    if (!fallbackResult.ok) {
      const error = fallbackResult.error;
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return false;
      }
      setAuthError(error.message || "Ostajan toiminnon päivitys epäonnistui.");
      return false;
    }

    if (skipRefresh) {
      if (typeof applyLocalOfferUpdate === "function") {
        applyLocalOfferUpdate();
      }
    } else {
      await refreshBuyerOffers();
      setRefreshTick((prev) => prev + 1);
    }
    return true;
  };

  const updateFulfillmentStatus = async (offer, fulfillmentStatus) => {
    const ok = await runBuyerOfferMutation({
      action: "update_fulfillment",
      offer,
      payload: { fulfillmentStatus },
      fallbackPatch: { fulfillment_status: fulfillmentStatus },
    });
    if (!ok) return;

    setAuthInfo(
      fulfillmentStatus === "delivery_agreed"
        ? "Toimitus merkitty sovituksi."
        : fulfillmentStatus === "delivered"
        ? "Kalaerä kuitattu vastaanotetuksi."
        : "Toimituksen tila päivitetty."
    );
    if (profile?.role !== "buyer") {
      await sendPushEvent({
        targetBuyerId: offer?.buyer_id || "",
        title: fulfillmentStatus === "delivered" ? "Toimitus merkitty toimitetuksi" : "Toimitus sovittu",
        body: fulfillmentStatus === "delivered"
          ? `${offer?.seller_name || "Myyjä"} merkitsi kaupan ${buildPushEventHeadline(offer)} toimitetuksi.`
          : `${offer?.seller_name || "Myyjä"} merkitsi kaupan ${buildPushEventHeadline(offer)} toimituksen sovituksi.`,
        eventType: fulfillmentStatus,
        route: "offers",
        offerId: offer?.id,
        batchId: offer?.batch_id,
      });
    } else if (fulfillmentStatus === "delivered") {
      await sendPushEvent({
        targetUserId: offer?.seller_user_id || "",
        title: "Kalaerä kuitattu vastaanotetuksi",
        body: `${getBuyerPrivateUntilAcceptedLabel(offer)} kuittasi kaupan ${buildPushEventHeadline(offer)} vastaanotetuksi. Voit nyt tehdä laskun apin kautta.`,
        eventType: "delivery_received",
        route: "billing",
        offerId: offer?.id,
        batchId: offer?.batch_id,
      });
    }
  };

  const markBuyerOfferViewed = async (offer) => {
    if (offer?.status !== "sent") return true;
    return await runBuyerOfferMutation({
      action: "viewed",
      offer,
      payload: {},
      fallbackPatch: { status: "viewed" },
    });
  };

  const sendBuyerResponseEmail = async (offer, actionLabel) => {
    let sellerEmail = null;

    if (offer?.seller_user_id) {
      const { data: sellerProfile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", offer.seller_user_id)
        .maybeSingle();
      sellerEmail = sellerProfile?.email || null;
    }

    if (!sellerEmail) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    const revealIdentity = offer?.status === "accepted";
    const buyerLabel = revealIdentity
      ? (offer?.buyer_company_name || offer?.buyer_email || "Ostaja")
      : (offer?.buyer_type === "ravintola"
        ? "Anonyymi ravintola"
        : offer?.buyer_type === "tukku"
        ? "Anonyymi tukku"
        : offer?.buyer_type === "kauppa"
        ? "Anonyymi kauppa"
        : "Anonyymi ostaja");

    await supabase.functions.invoke("send-buyer-response-email", {
      body: {
        sellerEmail,
        offerLink: `${getPublicAppBaseUrl()}?offer=${offer.id}`,
        offer: {
          buyerLabel,
          buyerEmail: revealIdentity ? offer?.buyer_email : null,
          buyerPhone: revealIdentity ? offer?.buyer_phone : null,
          species_summary: offer?.species_summary,
          total_kilos: offer?.total_kilos,
          area: offer?.area,
          spot: offer?.spot,
          counter_price_per_kg: offer?.counter_price_per_kg,
          reserved_kilos: offer?.reserved_kilos,
          buyer_message: offer?.buyer_message,
          status: offer?.status,
          actionLabel,
        },
      },
    }).catch(() => null);
  };

  const sendBuyerAcceptedEmail = async (offer) => {
    const buyerEmail = (offer?.buyer_email || "").trim().toLowerCase();
    if (!buyerEmail) return;

    let sellerEmail = "";
    let sellerPhone = "";
    if (offer?.seller_user_id) {
      const { data: sellerProfile } = await supabase
        .from("profiles")
        .select("email, phone")
        .eq("id", offer.seller_user_id)
        .maybeSingle();
      sellerEmail = sellerProfile?.email || "";
      sellerPhone = sellerProfile?.phone || "";
    }

    const sellerInfo = getBuyerVisibleSellerInfo({ ...offer, status: "accepted" });
    const sellerName = sellerInfo.sellerName || profile?.display_name || profile?.email || offer?.seller_name || "Myyja";
    const tradeValue = euro(calculateCommissionDetails(offer).tradeValue);
    const acceptedKilos = Number(offer?.reserved_kilos || offer?.total_kilos || 0);
    const batchId = offer?.batch_id || "";

    const { error } = await supabase.functions.invoke("send-buyer-accepted-email", {
      body: {
        buyerEmail,
        offerLink: `${getPublicAppBaseUrl()}?offer=${offer.id}`,
        offer: {
          sellerName,
          sellerEmail,
          sellerPhone,
          sellerCommercialFishingId: sellerInfo.sellerCommercialFishingId,
          species_summary: offer?.species_summary,
          total_kilos: offer?.total_kilos,
          accepted_kilos: acceptedKilos,
          area: sellerInfo.sellerArea || offer?.area,
          spot: sellerInfo.sellerSpot || offer?.spot,
          delivery_method: sellerInfo.deliveryMethod,
          delivery_area: sellerInfo.deliveryArea,
          delivery_cost: sellerInfo.deliveryCost,
          earliest_delivery_date: sellerInfo.earliestDeliveryDate,
          cold_transport: sellerInfo.coldTransport,
          public_location: sellerInfo.publicLocation,
          counter_price_per_kg: offer?.counter_price_per_kg,
          reserved_kilos: offer?.reserved_kilos,
          trade_value: tradeValue,
          batch_id: batchId,
          qr_image_url: getBatchQrImageUrl(batchId),
          buyer_delivery_address: offer?.buyer_delivery_address,
          buyer_delivery_postcode: offer?.buyer_delivery_postcode,
          buyer_delivery_city: offer?.buyer_delivery_city,
          buyer_billing_address: offer?.buyer_billing_address,
          buyer_billing_postcode: offer?.buyer_billing_postcode,
          buyer_billing_city: offer?.buyer_billing_city,
          buyer_billing_email: offer?.buyer_billing_email,
          fulfillment_status: offer?.fulfillment_status || "awaiting_contact",
          status: "accepted",
        },
      },
    });

    if (error) {
      throw new Error(error.message || "Hyväksyntäsähköpostin lähetys epäonnistui.");
    }
  };

  const onSubmitCounter = async (offer) => {
    const missingBuyerFields = getMissingBuyerTradeFields(linkedBuyerRecord, profile);
    if (missingBuyerFields.length > 0) {
      setAccountPanelOpen(true);
      setBuyerOfferInlineError({
        offerId: String(offer?.id || ""),
        message: `Täytä omat tiedot ennen kuin voit tehdä vastatarjouksen. Puuttuvat tiedot: ${missingBuyerFields.join(", ")}.`,
      });
      return;
    }

    setBuyerOfferInlineError({ offerId: "", message: "" });

    const mixedOffer = isMixedOffer(offer);
    let price = parseLocaleNumber(buyerAction.counter_price_per_kg);
    let msg = buyerAction.buyer_message?.trim() || null;
    if (mixedOffer) {
      const rows = getMixedOfferCounterRows(offer.species_summary);
      const perSpeciesPrices = {};
      for (const row of rows) {
        const parsedPrice = parseLocaleNumber(buyerAction.mixed_counter_prices?.[row.key]);
        if (parsedPrice == null) {
          setAuthError("Täytä vastatarjoushinta jokaiselle kalalajille.");
          return;
        }
        perSpeciesPrices[row.key] = parsedPrice;
      }
      const totalWeight = rows.reduce((sum, row) => sum + Number(row.weight || 0), 0);
      const weightedTotal = rows.reduce(
        (sum, row) => sum + perSpeciesPrices[row.key] * Number(row.weight || 0),
        0
      );
      const fallbackPrice = rows.length > 0 ? perSpeciesPrices[rows[0].key] : null;
      price =
        totalWeight > 0
          ? Number((weightedTotal / totalWeight).toFixed(2))
          : fallbackPrice;
      const speciesCounterText = [
        "Lajikohtainen vastatarjous:",
        ...rows.map(
          (row) =>
            `- ${row.label}: ${perSpeciesPrices[row.key].toFixed(2).replace(".", ",")} €/${row.unit}`
        ),
      ].join("\n");
      msg = [speciesCounterText, buyerAction.buyer_message?.trim()]
        .filter(Boolean)
        .join("\n\n");
    }
    const counterPatch = {
      status: "countered",
      counter_price_per_kg: price,
      buyer_message: msg,
    };
    const ok = await runBuyerOfferMutation({
      action: "counter",
      offer,
      payload: {
        counterPricePerKg: price,
        buyerMessage: msg,
      },
      fallbackPatch: counterPatch,
    });
    if (ok) {
      const updatedOffer = { ...offer, ...counterPatch };
      await sendBuyerResponseEmail(updatedOffer, "Ostaja teki vastatarjouksen");
      await sendPushEvent({
        targetUserId: offer?.seller_user_id || "",
        title: "Uusi vastatarjous",
        body: `${getBuyerPrivateUntilAcceptedLabel(updatedOffer)} teki vastatarjouksen kaupasta ${buildPushEventHeadline(updatedOffer)}.`,
        eventType: "buyer_countered",
        route: "offers",
        offerId: offer?.id,
        batchId: offer?.batch_id,
      });
      setAuthInfo("Vastatarjous lähetetty myyjälle.");
      setBuyerAction({
        counter_price_per_kg: "",
        counter_price_per_kg_gross_input: "",
        mixed_counter_prices: {},
        mixed_counter_prices_gross: {},
        reserved_kilos: "",
        buyer_message: "",
      });
      setBuyerActionMode("counter");
      setBuyerActiveOfferId(null);
    }
  };

  const onReserve = async (offer) => {
    const missingBuyerFields = getMissingBuyerTradeFields(linkedBuyerRecord, profile);
    if (missingBuyerFields.length > 0) {
      setAccountPanelOpen(true);
      setBuyerOfferInlineError({
        offerId: String(offer?.id || ""),
        message: `Täytä omat tiedot ennen kuin voit varata erän. Puuttuvat tiedot: ${missingBuyerFields.join(", ")}.`,
      });
      return;
    }

    setBuyerOfferInlineError({ offerId: "", message: "" });

    const confirmed = typeof window === "undefined"
      ? true
      : window.confirm("Haluatko varmasti ostaa tämän kalaerän?");

    if (!confirmed) return;

    const reserved = Number(offer.total_kilos || 0);
    const reservePatch = {
      status: "reserved",
      reserved_kilos: reserved,
      buyer_message: null,
    };
    const ok = await runBuyerOfferMutation({
      action: "reserve",
      offer,
      payload: {
        reservedKilos: reserved,
      },
      fallbackPatch: reservePatch,
    });
    if (ok) {
      const updatedOffer = { ...offer, ...reservePatch };
      await sendBuyerResponseEmail(updatedOffer, "Ostaja varasi erän");
      await sendPushEvent({
        targetUserId: offer?.seller_user_id || "",
        title: "Erä varattu",
        body: `${getBuyerPrivateUntilAcceptedLabel(updatedOffer)} varasi erän ${buildPushEventHeadline(updatedOffer)}.`,
        eventType: "buyer_reserved",
        route: "offers",
        offerId: offer?.id,
        batchId: offer?.batch_id,
      });
      setAuthInfo("Erä varattu. Myyjälle näkyy varaus.");
      setBuyerAction({
        counter_price_per_kg: "",
        counter_price_per_kg_gross_input: "",
        mixed_counter_prices: {},
        mixed_counter_prices_gross: {},
        reserved_kilos: "",
        buyer_message: "",
      });
      setBuyerActionMode("counter");
      setBuyerActiveOfferId(null);
    }
  };

  const onRejectBuyerOffer = async (offer) => {
    const ok = await runBuyerOfferMutation({
      action: "reject",
      offer,
      payload: {},
      fallbackPatch: { status: "rejected" },
    });
    if (ok) {
      await sendBuyerResponseEmail({ ...offer, status: "rejected" }, "Ostaja hylkäsi tarjouksen");
      setAuthInfo("Tarjous hylätty.");
    }
  };

  const onRemoveSoldBuyerOffer = async (offer) => {
    const confirmed = typeof window === "undefined"
      ? true
      : window.confirm("Poistetaanko myydyn erän ilmoitus avoimista tarjouksista?");

    if (!confirmed) return;

    const ok = await runBuyerOfferMutation({
      action: "cancel",
      offer,
      payload: {},
      fallbackPatch: { status: "cancelled" },
      skipRefresh: true,
      applyLocalOfferUpdate: () => {
        setBuyerOffers((current) => current.map((item) => (
          item.id === offer.id
            ? { ...item, status: "cancelled" }
            : item
        )));
      },
    });
    if (ok) {
      setBuyerActiveOfferId((current) => (current === offer.id ? null : current));
      setAuthInfo("Myydyn erän ilmoitus poistettu näkyvistä.");
    }
  };

  const handleRemoveEntryFromSale = async (entryIds) => {
    const normalizedEntryIds = Array.isArray(entryIds) ? entryIds.map(String) : [String(entryIds)];
    const targetEntries = (profile.role === "processor" ? processedSaleEntries : saleEntries)
      .filter((entry) => normalizedEntryIds.includes(String(entry.id)));

    if (targetEntries.length === 0) {
      setAuthError("Myynnistä poistettavaa erää ei löytynyt.");
      return;
    }

    const targetEntry = targetEntries[0];
    const entryLabel = targetEntries.length > 1
      ? "monilajinen erä"
      : targetEntry.productName || targetEntry.species || "erä";
    const confirmed = typeof window === "undefined"
      ? true
      : window.confirm(`Poistetaanko ${entryLabel} myynnistä? Tarjous häviää ostajien näkymästä.`);

    if (!confirmed) return;

    const isProcessedEntry = Boolean(targetEntry.productName || targetEntry.productType);
    const tableName = isProcessedEntry ? "processed_batches" : "catch_entries";
    const updatePayload = {
      offer_to_shops: false,
      offer_to_restaurants: false,
      offer_to_wholesalers: false,
      delivery_possible: false,
      delivery_method: null,
      transport_mode: null,
      origin_point_id: null,
      transport_company_id: null,
      pickup_address: null,
      delivery_destinations: [],
      delivery_area: null,
      delivery_cost: null,
      earliest_delivery_date: null,
      cold_transport: false,
    };

    const { error: entryUpdateError } = await supabase
      .from(tableName)
      .update(updatePayload)
      .in("id", normalizedEntryIds);

    if (entryUpdateError) {
      if (isMissingRefreshTokenError(entryUpdateError)) {
        await invalidateSession();
        return;
      }
      setAuthError(entryUpdateError.message);
      return;
    }

    let buyerOfferDeleteQuery = supabase
      .from("buyer_offers")
      .delete()
      .eq("seller_user_id", targetEntry.ownerUserId || profile?.id || "")
      .in("status", BUYER_OFFER_COMPETING_OPEN_STATUSES);

    const batchIds = targetEntries
      .map((entry) => String(entry.batchId || "").trim())
      .filter(Boolean);

    if (batchIds.length > 0) {
      buyerOfferDeleteQuery = buyerOfferDeleteQuery.in("batch_id", batchIds);
    } else {
      buyerOfferDeleteQuery = buyerOfferDeleteQuery
        .eq("area", targetEntry.area || "")
        .eq("spot", targetEntry.spot || "")
        .eq("total_kilos", Number(targetEntry.kilos || 0));
    }

    const { error: buyerOfferDeleteError } = await buyerOfferDeleteQuery;

    if (buyerOfferDeleteError) {
      if (isMissingRefreshTokenError(buyerOfferDeleteError)) {
        await invalidateSession();
        return;
      }
      setAuthError(buyerOfferDeleteError.message);
      return;
    }

    setAuthInfo("Erä poistettu myynnistä. Tarjous ei enää näy ostajille.");
    await refreshBuyerOffers();
    setRefreshTick((prev) => prev + 1);
  };

  const handleCreateOffer = async (entry) => {
    setAuthError("");
    setAuthInfo("");
    if (!offerForm.company_name || !offerForm.contact_name || !offerForm.contact_email || !offerForm.offer_price_per_kg) {
      setAuthError("Täytä vähintään yritys, yhteyshenkilö, sähköposti ja tarjous €/kg.");
      return;
    }
    const { error } = await supabase.from("wholesale_offers").insert({
      entry_id: entry.id,
      company_name: offerForm.company_name,
      contact_name: offerForm.contact_name,
      contact_email: offerForm.contact_email,
      contact_phone: offerForm.contact_phone,
      offer_price_per_kg: parseLocaleNumber(offerForm.offer_price_per_kg) || 0,
      message: offerForm.message,
      created_by_user_id: profile?.id || null,
      status: "pending",
    });
    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setAuthError(error.message);
      return;
    }
    setOfferForm({ company_name: "", contact_name: "", contact_email: "", contact_phone: "", offer_price_per_kg: "", message: "" });
    setAuthInfo("Tarjous lähetetty.");
    setRefreshTick((prev) => prev + 1);
  };

  const onUpdateOfferStatus = async (offer, status) => {
    const { error } = await supabase.from("wholesale_offers").update({ status }).eq("id", offer.id);
    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setAuthError(error.message);
      return;
    }
    setRefreshTick((prev) => prev + 1);
  };

  const onUpdateBuyerOfferStatus = async (offer, status) => {
    setAuthWarning("");
    let updatePayload = { status };
    let resolvedBuyerPushId = String(offer?.buyer_id || "").trim();

    if (status === "accepted") {
      let sellerProfileForTrade = profile;

      if (offer?.seller_user_id && String(offer.seller_user_id) !== String(profile?.id || "")) {
        const { data: fetchedSellerProfile, error: fetchedSellerProfileError } = await supabase
          .from("profiles")
          .select("id, email, display_name, company_name, business_id, address, postcode, city, billing_address, billing_postcode, billing_city, billing_email, bank_account_iban, contact_email, phone, commercial_fishing_id")
          .eq("id", offer.seller_user_id)
          .maybeSingle();

        if (fetchedSellerProfileError) {
          if (isMissingRefreshTokenError(fetchedSellerProfileError)) {
            await invalidateSession();
            return;
          }
          setAuthError(fetchedSellerProfileError.message);
          return;
        }

        sellerProfileForTrade = fetchedSellerProfile || null;
      }

      const missingSellerBillingFields = getMissingSellerBillingFields(sellerProfileForTrade);
      if (missingSellerBillingFields.length > 0) {
        setAuthError(`Kauppaa ei voi hyväksyä ennen kuin kalastajan laskutustiedot on tallennettu. Puuttuu: ${missingSellerBillingFields.join(", ")}.`);
        return;
      }

      let buyerRecord = buyers.find((buyer) => buyer.id === offer.buyer_id || buyer.email === (offer.buyer_email || "").toLowerCase());

      if (!buyerRecord && (offer.buyer_id || offer.buyer_email)) {
        let buyerLookupQuery = supabase.from("buyers").select("*").limit(1);
        buyerLookupQuery = offer.buyer_id
          ? buyerLookupQuery.eq("id", offer.buyer_id)
          : buyerLookupQuery.eq("email", (offer.buyer_email || "").toLowerCase());

        const { data: fetchedBuyer, error: fetchedBuyerError } = await buyerLookupQuery.maybeSingle();
        if (fetchedBuyerError) {
          if (isMissingRefreshTokenError(fetchedBuyerError)) {
            await invalidateSession();
            return;
          }
          setAuthError(fetchedBuyerError.message);
          return;
        }
        buyerRecord = fetchedBuyer || null;
      }

      updatePayload = {
        ...updatePayload,
        fulfillment_status: offer.fulfillment_status || "awaiting_contact",
        seller_name: offer.seller_name || sellerProfileForTrade?.company_name || sellerProfileForTrade?.display_name || sellerProfileForTrade?.email || null,
        seller_business_id: sellerProfileForTrade?.business_id || offer.seller_business_id || null,
        seller_address: sellerProfileForTrade?.address || offer.seller_address || null,
        seller_postcode: sellerProfileForTrade?.postcode || offer.seller_postcode || null,
        seller_city: sellerProfileForTrade?.city || offer.seller_city || null,
        seller_contact_email: sellerProfileForTrade?.contact_email || sellerProfileForTrade?.email || offer.seller_contact_email || null,
        seller_email: sellerProfileForTrade?.email || offer.seller_email || null,
        seller_phone: sellerProfileForTrade?.phone || offer.seller_phone || null,
        seller_commercial_fishing_id: sellerProfileForTrade?.commercial_fishing_id || offer.seller_commercial_fishing_id || null,
        seller_bank_account_iban: sellerProfileForTrade?.bank_account_iban || offer.seller_bank_account_iban || null,
        seller_bank_bic: sellerProfileForTrade?.bank_bic || offer.seller_bank_bic || null,
      };

      if (buyerRecord) {
        resolvedBuyerPushId = String(buyerRecord.id || resolvedBuyerPushId || "").trim();
        updatePayload = {
          ...updatePayload,
          buyer_delivery_address: buyerRecord.delivery_address || null,
          buyer_delivery_postcode: buyerRecord.delivery_postcode || null,
          buyer_delivery_city: buyerRecord.delivery_city || null,
          buyer_billing_address: buyerRecord.billing_address || null,
          buyer_billing_postcode: buyerRecord.billing_postcode || null,
          buyer_billing_city: buyerRecord.billing_city || null,
          buyer_billing_email: buyerRecord.billing_email || null,
          buyer_business_id: buyerRecord.business_id || null,
        };
      }
    }

    const { error } = await updateBuyerOfferWithCompatFallback(offer.id, updatePayload);

    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setAuthError(error.message);
      return;
    }

    if (status === "accepted") {
      const { data: openOffers, error: openOffersError } = await supabase
        .from("buyer_offers")
        .select("id, batch_id, seller_user_id, species_summary, total_kilos, area, spot, status")
        .eq("seller_user_id", offer.seller_user_id)
        .in("status", BUYER_OFFER_COMPETING_OPEN_STATUSES);

      if (openOffersError) {
        if (isMissingRefreshTokenError(openOffersError)) {
          await invalidateSession();
          return;
        }
        console.warn("Competing buyer offer lookup failed after accepted trade", {
          offerId: offer?.id,
          sellerUserId: offer?.seller_user_id,
          batchId: offer?.batch_id,
          message: openOffersError.message,
        });
        setAuthWarning(`Kauppa hyväksyttiin, mutta muiden saman erän tarjousten sulkeminen epäonnistui: ${openOffersError.message}`);
      } else {
        const competingOfferIds = (openOffers || [])
          .filter((candidate) => candidate.id !== offer.id && offersShareSameLot(offer, candidate))
          .map((candidate) => candidate.id);

        if (competingOfferIds.length > 0) {
          const { error: competingOffersError } = await supabase
            .from("buyer_offers")
            .update({ status: "sold" })
            .in("id", competingOfferIds);

          if (competingOffersError) {
            if (isMissingRefreshTokenError(competingOffersError)) {
              await invalidateSession();
              return;
            }
            console.warn("Bulk competing buyer offer close failed after accepted trade", {
              offerId: offer?.id,
              competingOfferIds,
              message: competingOffersError.message,
            });

            const closeResults = await Promise.all(
              competingOfferIds.map(async (competingOfferId) => {
                const { error: singleCloseError } = await supabase
                  .from("buyer_offers")
                  .update({ status: "sold" })
                  .eq("id", competingOfferId);
                return {
                  id: competingOfferId,
                  error: singleCloseError,
                };
              })
            );

            const failedClosures = closeResults.filter((result) => result.error);

            if (failedClosures.length > 0) {
              console.warn("Some competing buyer offers still failed to close after retry", {
                offerId: offer?.id,
                failures: failedClosures.map((result) => ({
                  id: result.id,
                  message: result.error?.message || "",
                })),
              });
              const failureSummary = failedClosures
                .map((result) => `${result.id}: ${result.error?.message || "tuntematon virhe"}`)
                .join(" | ");
              setAuthWarning(`Kauppa hyväksyttiin, mutta ${failedClosures.length} saman erän tarjousta jäi avoimeksi. ${failureSummary}`);
            } else {
              setAuthWarning("Kauppa hyväksyttiin. Muiden saman erän tarjousten sulkeminen onnistui varayrityksellä.");
            }
          }
        }
      }
    }

    setAuthInfo(
      status === "accepted"
        ? "Kauppa hyväksytty. Ostajan toimitus- ja laskutustiedot tallennettu kaupalle."
        : status === "rejected"
        ? "Tarjous hylätty."
        : "Tarjouksen tila päivitetty."
    );

    if (status === "accepted") {
      try {
        await sendBuyerAcceptedEmail({ ...offer, ...updatePayload, status: "accepted" });
      } catch (emailError) {
        setAuthWarning(`Kauppa hyväksyttiin, mutta vahvistussähköpostin lähetys epäonnistui: ${String(emailError?.message || emailError)}`);
      }
      const acceptedTradeHeadline = buildPushEventHeadline({ ...offer, ...updatePayload });
      const acceptedTitle = offer?.status === "countered" ? "Vastatarjous hyväksytty" : "Kauppa hyväksytty";
      const acceptedBody = offer?.status === "countered"
        ? `Kalastaja hyväksyi vastatarjouksesi kaupasta ${acceptedTradeHeadline}.`
        : `${offer?.seller_name || "Myyjä"} hyväksyi kaupan ${acceptedTradeHeadline}.`;
      await sendPushEvent({
        targetBuyerId: resolvedBuyerPushId,
        title: acceptedTitle,
        body: acceptedBody,
        eventType: "offer_accepted",
        route: "offers",
        offerId: offer?.id,
        batchId: offer?.batch_id,
      });
    }

    if (status === "rejected") {
      await sendPushEvent({
        targetBuyerId: offer?.buyer_id || "",
        title: "Tarjous hylätty",
        body: `${offer?.seller_name || "Myyjä"} hylkäsi tarjouksen kaupasta ${buildPushEventHeadline({ ...offer, ...updatePayload })}.`,
        eventType: "offer_rejected",
        route: "offers",
        offerId: offer?.id,
        batchId: offer?.batch_id,
      });
    }

    await refreshBuyerOffers();
    setRefreshTick((prev) => prev + 1);
  };

  const sendProcessedOfferEmail = async ({ formState, profileState, batchId }) => {
    if (!formState.listForSale) {
      return { skipped: true, sent: [], failed: [], recipientAnalysis: { matching: [], excluded: [] } };
    }
    const rows = [{ species: formState.productName || formState.productType || "Jaloste-erä", kilos: formState.kilos, count: formState.packageCount }];
    const recipientAnalysis = analyzeOfferRecipients({
      offerToShops: formState.offerToShops,
      offerToRestaurants: formState.offerToRestaurants,
      offerToWholesalers: formState.offerToWholesalers,
      deliveryPossible: Boolean(formState.deliveryPossible),
      deliveryMethod: formState.deliveryMethod || "Nouto",
      originPointId: formState.originPointId || "",
      deliveryDestinations: formState.deliveryDestinations || [],
    }, rows);
    const productTotal = getOfferProductTotal(rows);
    const selectedOriginPoint = getOriginPointById(formState.originPointId);
    const recipients = recipientAnalysis.matching.map((recipient) => ({
      ...recipient,
      email: (recipient.email || "").trim().toLowerCase(),
    }));

    if (recipients.length === 0) {
      return { skipped: true, sent: [], failed: [], recipientAnalysis };
    }

    const offerUrlBase = getPublicAppBaseUrl();
    const summaryLines = [
      `Tuote: ${formState.productName || "-"}`,
      `Tyyppi: ${formState.productType || "-"}`,
      `Käsittely: ${formState.processingMethod || "-"}`,
      `Raaka-aine: ${formState.speciesSummary || "-"}`,
      `Määrä: ${formState.kilos || 0} kg`,
      `Pakkauskoko: ${formState.packageSizeG || "-"} g`,
      `Pakkausten määrä: ${formState.packageCount || "-"}`,
      `Tuotantopäivä: ${formState.productionDate || "-"}`,
      `Parasta ennen: ${formState.bestBeforeDate || "-"}`,
    ].join(String.fromCharCode(10));

    const notes = [
      formState.notes || "",
      "",
      `Lähtöpaikka: ${formState.originCity || formState.municipality || "-"}`,
      `Kilpailuta kuljetus: ${formState.deliveryPossible ? "Kyllä" : "Ei"}`,
      "Toimitus:",
      `Toimitustapa: ${formState.deliveryMethod || "-"}`,
      formState.transportMode ? `Kuljetus järjestetään: ${getTransportModeLabel(formState.transportMode)}` : "",
      selectedOriginPoint ? `Luovutuspiste: ${selectedOriginPoint.name} / ${selectedOriginPoint.address}` : "",
      formState.transportMode === "pickup" ? `Nouto-osoite: ${resolvedProcessedPickupAddress || "-"}` : "",
      formState.estimatedPickupTime ? `Arvioitu noutoaika: ${formState.estimatedPickupTime}` : "",
      formState.pickupSurcharge !== "" ? `Noutolisä: ${formState.pickupSurcharge} €` : "",
      Array.isArray(formState.deliveryDestinations) && formState.deliveryDestinations.length > 0 ? `Toimituskohteet: ${formState.deliveryDestinations.join(", ")}` : "",
      `Toimitusalue: ${formatDeliveryDestinations(formState.deliveryDestinations) || formState.deliveryArea || "-"}`,
      `Toimituskustannus: ${formState.deliveryCost !== "" ? `${formState.deliveryCost} €` : "-"}`,
      `Aikaisin toimitus: ${formState.earliestDeliveryDate || "-"}`,
      `Kylmäkuljetus: ${formState.coldTransport ? "Kyllä" : "Ei"}`,
      `Paikkakunta: ${formState.municipality || "-"}`,
      `Käsittelypaikka: ${formState.spot || "-"}`,
    ].filter(Boolean).join(String.fromCharCode(10)).trim();

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    const recipientResults = await runWithConcurrency(recipients, OFFER_SEND_CONCURRENCY, async (recipient) => {
      const insertedOffer = await supabase
        .from("buyer_offers")
        .insert({
          batch_id: batchId,
          buyer_id: recipient.buyer_id || null,
          buyer_email: recipient.email,
          seller_user_id: profileState?.id || null,
          seller_name: profileState?.display_name || profileState?.email || null,
          total_kilos: Number(formState.kilos || 0),
          species_summary: summaryLines,
          area: formState.area,
          spot: formState.spot,
          gear: `Jaloste / ${formState.processingMethod || formState.productType || "-"}`,
          seller_origin_city: formState.originCity || formState.municipality || null,
          delivery_possible: Boolean(formState.deliveryPossible),
          delivery_method: formState.deliveryMethod || "Nouto",
          transport_mode: formState.transportMode || null,
          origin_point_id: formState.originPointId || null,
          transport_company_id: recipient.carrier_id || formState.transportCompanyId || null,
          delivery_destination_city: recipient.destination_city || null,
          delivery_destinations: formState.deliveryDestinations || [],
          route_price_eur: recipient.route_price_eur == null || recipient.route_price_eur === "" ? null : Number(recipient.route_price_eur),
          total_price_eur: recipient.total_price_eur == null || recipient.total_price_eur === "" ? null : Number(recipient.total_price_eur),
          delivered_price_per_kg: recipient.delivered_price_per_kg == null || recipient.delivered_price_per_kg === "" ? null : Number(recipient.delivered_price_per_kg),
          delivery_area: formatDeliveryDestinations(formState.deliveryDestinations) || formState.deliveryArea || null,
          delivery_cost: formState.deliveryCost === "" ? null : Number(formState.deliveryCost),
          earliest_delivery_date: formState.earliestDeliveryDate || null,
          cold_transport: Boolean(formState.coldTransport),
          notes,
          status: "sent",
          billing_status: "unbilled",
          owner_commission_status: "unbilled",
        })
        .select("id")
        .single();

      if (insertedOffer.error) {
        return {
          kind: "failed",
          payload: {
          company_name: recipient.company_name,
          contact_name: recipient.contact_name,
          email: recipient.email,
          channel: recipient.channel,
          error: insertedOffer.error.message || "buyer_offers-rivin tallennus epäonnistui",
          },
        };
      }

      const offerId = insertedOffer?.data?.id || null;

      const { data, error } = await invokeEdgeFunctionAuthenticated(
        "send-catch-offer-email",
        {
          entry: {
            species: formState.productName || formState.productType || "Jaloste-erä",
            kilos: Number(formState.kilos || 0),
            date: formState.productionDate,
            area: formState.area,
            municipality: formState.municipality || "",
            spot: formState.spot || "",
            gear: `Jaloste / ${formState.processingMethod || formState.productType || "-"}`,
            ownerName: profileState?.display_name || profileState?.email || "Tuntematon",
            commercialFishingId: profileState?.commercial_fishing_id || "",
            originCity: formState.originCity || formState.municipality || "",
            productTotal,
            deliveryPossible: Boolean(formState.deliveryPossible),
            deliveryMethod: formState.deliveryMethod || "Nouto",
            transportMode: formState.transportMode || "",
            originPointId: formState.originPointId || "",
            transportCompanyId: formState.transportCompanyId || "",
            pickupSurcharge: parseLocaleNumber(formState.pickupSurcharge),
            estimatedPickupTime: formState.estimatedPickupTime || "",
            deliveryDestinations: formState.deliveryDestinations || [],
            deliveryArea: formatDeliveryDestinations(formState.deliveryDestinations) || formState.deliveryArea || "",
            deliveryCost: parseLocaleNumber(formState.deliveryCost),
            earliestDeliveryDate: formState.earliestDeliveryDate || "",
            coldTransport: Boolean(formState.coldTransport),
            notes: [summaryLines, "", notes].join(String.fromCharCode(10)).trim(),
            offerUrlBase,
          },
          recipients: [{
            email: recipient.email,
            company_name: recipient.company_name,
            offer_id: offerId,
            offer_link: offerId ? `${offerUrlBase}?offer=${offerId}` : null,
            delivery_destination_city: recipient.destination_city || "",
            route_price_eur: recipient.route_price_eur,
            total_price_eur: recipient.total_price_eur,
            delivered_price_per_kg: recipient.delivered_price_per_kg,
            carrier_name: recipient.carrier_name || "",
          }],
        },
        accessToken
      );
      if (!error) {
        const pushResult = await sendPushEvent({
          targetBuyerId: recipient.buyer_id || "",
          title: "Uusi kalatarjous",
          body: `Sinulle on lähetetty uusi tarjous: ${formState.productName || formState.productType || "Jaloste-erä"}.`,
          eventType: "offer_sent",
          route: "offers",
          offerId,
          batchId,
        });
        return {
          kind: "sent",
          payload: {
          buyer_id: recipient.buyer_id,
          company_name: recipient.company_name,
          contact_name: recipient.contact_name,
          email: recipient.email,
          channel: recipient.channel,
          offer_id: offerId,
          offer_link: offerId ? `${offerUrlBase}?offer=${offerId}` : null,
          pushSkipped: Boolean(pushResult?.data?.skipped),
          pushSkipReason: String(pushResult?.data?.reason || "").trim(),
          data,
          },
        };
      } else {
        return {
          kind: "failed",
          payload: {
          company_name: recipient.company_name,
          contact_name: recipient.contact_name,
          email: recipient.email,
          channel: recipient.channel,
          error: error?.context?.error || error?.message || "Tarjoussähköpostin lähetys epäonnistui",
          },
        };
      }
    });

    const sent = recipientResults
      .filter((result) => result?.kind === "sent")
      .map((result) => result.payload);
    const failed = recipientResults
      .filter((result) => result?.kind === "failed")
      .map((result) => result.payload);

    if (failed.length > 0 && sent.length === 0) {
      throw new Error(`Tarjouksen lähetys epäonnistui ${failed.length} ostajalle.`);
    }

    return { skipped: false, sent, failed, recipientAnalysis };
  };

  const handleSave = async () => {
    if (!profile) return;
    const fisherPremiumRequired = profile.role === "member" && !hasFisherPremium;
    const totalKilosForOffer = speciesRows.reduce((sum, row) => sum + Number(row.kilos || 0), 0);
    const selectedVesselId = form.fishingWithoutVessel ? "" : String(form.selectedVesselId || commercialFishingVesselOptions[0] || "").trim();
    const batchSourceIdentifier = form.fishingWithoutVessel
      ? String(profile.commercial_fishing_id || "").trim()
      : getPreferredBatchSourceIdentifier(profile, selectedVesselId);
    const validRows = speciesRows.filter((row) => {
      const kilos = Number(row.kilos || 0);
      const count = Number(row.count || 0);
      return isCrayfishSpecies(getSpeciesRowLabel(row)) ? count > 0 : kilos > 0;
    });
    if (!validRows.length) {
      setAuthError("Täytä saaliille määrä ennen tallennusta. Ravuille kappalemäärä, muille lajeille vähintään kilot.");
      return;
    }
    if (validRows.some((row) => row.species === "Muu" && !String(row.customSpecies || "").trim())) {
      setAuthError("Kirjoita kalalajin nimi kaikille riveille, joilla lajiksi on valittu Muu.");
      return;
    }
    if (shouldSendOffer && validRows.some((row) => parseLocaleNumber(row.price_per_kg) == null)) {
      setAuthError("Täytä hinta jokaiselle kalalajille ennen saaliin tallennusta.");
      return;
    }
    if (form.listForSale && fisherPremiumRequired) {
      showFisherPremiumRequired("Tarjoa myyntiin, jäljitettävyystunnus ja tarjouslähetys");
      return;
    }
    if (validRows.some((row) => isCrayfishSpecies(getSpeciesRowLabel(row)) && Number(row.count || 0) <= 0)) {
      setAuthError("Täytä kappalemäärä kaikille täplärapu- ja jokirapuerille ennen saaliin tallennusta.");
      return;
    }
    if (form.listForSale && form.deliveryPossible && form.deliveryMethod === "Kuljetus järjestetään") {
      if (!currentOriginCity) {
        setAuthError("Valitse lähtöpaikka ennen toimitettavan erän tallennusta.");
        return;
      }
      if (!form.transportMode) {
        setAuthError("Valitse kuljetuksen luovutustapa ennen tarjouksen lähetystä.");
        return;
      }
      if (form.transportMode === "pickup" && !resolvedPickupAddress) {
        setAuthError("Täytä nouto-osoite ennen tarjouksen lähetystä.");
        return;
      }
      if ((form.transportMode === "terminal" || form.transportMode === "collection_point") && !form.originPointId) {
        setAuthError("Valitse terminaali tai keräilypiste ennen tarjouksen lähetystä.");
        return;
      }
      if (!Array.isArray(form.deliveryDestinations) || form.deliveryDestinations.length === 0) {
        setAuthError("Valitse vähintään yksi toimituskohde tai käytä Ehdota kohteet -toimintoa.");
        return;
      }
      const unsupportedDestinations = form.deliveryDestinations.filter((city) => !getRoutePrice(form.originPointId, city, totalKilosForOffer));
      if (unsupportedDestinations.length > 0) {
        setAuthError(`Toimitushinta puuttuu kohteille: ${unsupportedDestinations.join(", ")}`);
        return;
      }
    }
    if (!fisherPremiumRequired) {
      if (form.fishingWithoutVessel && !String(profile.commercial_fishing_id || "").trim()) {
        setAuthError("Aseta kaupallisen kalastajan tunnus kohdassa Omat tiedot ennen eräkoodin luontia, kun kalastat ilman alusta.");
        return;
      }
      if (!form.fishingWithoutVessel && commercialFishingVesselOptions.length > 0 && !selectedVesselId) {
        setAuthError("Valitse käytetty kaupallinen kalastusalus ennen saaliin tallennusta.");
        return;
      }
      const officialFormIssues = validateCatchFormForOfficialReporting(form);
      if (officialFormIssues.length > 0) {
        setAuthError(`Täytä virallisen saalisilmoituksen tiedot ennen tallennusta: ${officialFormIssues.join(" ")}`);
        return;
      }
    }
    setSaving(true);
    let rowsWithBatchIds;
    if (fisherPremiumRequired) {
      rowsWithBatchIds = validRows.map((row, rowIndex) => ({
        ...row,
        batch_id: generateDraftCatchBatchId({
          date: form.date,
          ownerUserId: profile.id,
          rowIndex,
        }),
      }));
    } else {
      try {
        rowsWithBatchIds = await Promise.all(validRows.map(async (row) => ({
          ...row,
          batch_id: await generateBatchId({
            sourceIdentifier: batchSourceIdentifier,
            date: form.date,
            speciesLabels: [getSpeciesRowLabel(row)],
            quantity: Number(row.kilos || 0) > 0 ? Number(row.kilos || 0) : Number(row.count || 0),
            supabaseClient: supabase,
            ownerUserId: profile.id,
            insertSeparatorAfterSource: Boolean(form.fishingWithoutVessel),
          }),
        })));
      } catch (error) {
        setSaving(false);
        if (isMissingRefreshTokenError(error)) {
          await invalidateSession();
          return;
        }
        setAuthError(error.message || "Batch ID:n luonti epäonnistui.");
        return;
      }
    }
    const payload = rowsWithBatchIds.map((row) => ({
      offer_to_shops: !fisherPremiumRequired && form.listForSale ? form.offerToShops : false,
      offer_to_restaurants: !fisherPremiumRequired && form.listForSale ? form.offerToRestaurants : false,
      offer_to_wholesalers: !fisherPremiumRequired && form.listForSale ? form.offerToWholesalers : false,
      date: form.date,
      area: form.area,
      municipality: form.municipality,
      origin_city: form.originCity || form.municipality || null,
      spot: form.spot,
      species: getSpeciesRowLabel(row),
      water_type: form.waterType || null,
      kilos: Number(row.kilos || 0),
      count: Number(row.count || 0),
      gear: form.gear,
      delivery_possible: !fisherPremiumRequired && form.listForSale ? Boolean(form.deliveryPossible) : false,
      delivery_method: !fisherPremiumRequired && form.listForSale ? form.deliveryMethod : null,
      transport_mode: !fisherPremiumRequired && form.listForSale ? (form.transportMode || null) : null,
      origin_point_id: !fisherPremiumRequired && form.listForSale ? (form.originPointId || null) : null,
      transport_company_id: !fisherPremiumRequired && form.listForSale ? (form.transportCompanyId || null) : null,
      pickup_address: !fisherPremiumRequired && form.listForSale ? (resolvedPickupAddress || null) : null,
      delivery_destinations: !fisherPremiumRequired && form.listForSale ? form.deliveryDestinations : [],
      delivery_area: !fisherPremiumRequired && form.listForSale ? derivedDeliveryArea : null,
      delivery_cost: !fisherPremiumRequired && form.listForSale ? parseLocaleNumber(form.deliveryCost) : null,
      earliest_delivery_date: !fisherPremiumRequired && form.listForSale ? (form.earliestDeliveryDate || null) : null,
      cold_transport: !fisherPremiumRequired && form.listForSale ? form.coldTransport : false,
      commercial_fishing_id: profile.commercial_fishing_id || null,
      commercial_fishing_vessel_id: selectedVesselId || null,
      price_per_kg: parseLocaleNumber(row.price_per_kg),
      notes: appendCatchDetailsToNotes(form.notes, form),
      batch_id: row.batch_id,
      owner_user_id: profile.id,
      owner_name: profile.display_name,
    }));

    let insertError = null;
    const { error: initialInsertError } = await supabase.from("catch_entries").insert(payload);
    insertError = initialInsertError;

    if (insertError && String(insertError.message || "").includes("water_type")) {
      const fallbackPayload = payload.map(({ water_type, ...rest }) => rest);
      const { error: fallbackInsertError } = await supabase.from("catch_entries").insert(fallbackPayload);
      insertError = fallbackInsertError;
    }

    const error = insertError;
    if (error) {
      setSaving(false);
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      if (String(error.message || "").includes("price_per_kg")) {
        setAuthError("Tietokanta vaatii vielä hinnan saaliserälle. Aja SQL Editorissa muutos, joka sallii tyhjän hinnan saaliskirjanpidossa: alter table public.catch_entries alter column price_per_kg drop not null;");
        return;
      }
      if (String(error.message || "").includes("commercial_fishing_vessel_id")) {
        setAuthError("Tietokannasta puuttuu saaliserän aluskenttä. Lisää SQL Editorissa catch_entries-tauluun commercial_fishing_vessel_id ennen tallennusta.");
        return;
      }
      setAuthError(error.message);
      return;
    }

    const normalizedWaterType = String(form.waterType || "").trim();
    if (normalizedWaterType && normalizedWaterType !== String(profile?.water_type || "").trim()) {
      const { data: updatedProfile, error: profileUpdateError } = await supabase
        .from("profiles")
        .update({ water_type: normalizedWaterType })
        .eq("id", profile.id)
        .select("*")
        .single();

      if (!profileUpdateError && updatedProfile) {
        setProfile((prev) => ({
          ...(prev || {}),
          ...updatedProfile,
        }));
      }
    }

    try {
      const emailResult = await sendCatchOfferEmail({
        formState: form,
        rows: rowsWithBatchIds,
        profileState: profile,
      });

      if (shouldSendOffer) {
        if (emailResult.skipped) {
          const parts = ["Saalis tallennettu, mutta yhtään ostajaa ei täyttänyt tarjousehtoja."];
          setAuthInfo(parts.join(String.fromCharCode(10)));
        } else {
          const parts = [`Saalis tallennettu. Tarjous lähetetty ${emailResult.sent.length} ostajalle.`];
          const skippedPushCount = emailResult.sent.filter((item) => item.pushSkipped).length;
          const partialEmailFailureCount = emailResult.sent.filter((item) => item.emailFailed).length;
          if (skippedPushCount > 0) {
            parts.push("", `Push-ilmoitus ei lähtenyt ${skippedPushCount} ostajalle.`);
          }
          if (partialEmailFailureCount > 0) {
            parts.push("", `Tarjoussähköposti epäonnistui ${partialEmailFailureCount} ostajalle, mutta appi-ilmoitus lähti.`);
          }
          if (emailResult.failed.length > 0) {
            parts.push("", `Tarjouksen lähetys epäonnistui ${emailResult.failed.length} ostajalle.`);
          }
          if (emailResult.failed.length > 0) {
            setAuthError(parts.join(String.fromCharCode(10)));
            setAuthInfo("");
          } else {
            setAuthInfo(parts.join(String.fromCharCode(10)));
          }
        }
      } else if (fisherPremiumRequired) {
        setAuthInfo("Saalis tallennettu. Jäljitettävyystunnus, myyntiin tarjoaminen, etiketit ja virallinen saalisilmoitus avautuvat, kun kalastajalisenssi aktivoidaan.");
      } else {
        setAuthInfo("Saalis tallennettu.");
      }
    } catch (emailError) {
      console.error("Sähköpostin lähetys epäonnistui:", emailError);
      setAuthError(`Saalis tallennettu, mutta tarjoussähköpostin lähetys epäonnistui: ${String(emailError?.message || emailError)}`);
      setAuthInfo("");
    }

    setSaving(false);
    setSavedLandingPlaces((prev) => {
      const next = buildLandingPlaceHistory(form.landingPlace, prev);
      if (next.length === prev.length && next.every((item, index) => item === prev[index])) return prev;
      return next;
    });
    if (catchAreaSelector === CUSTOM_LAKE_AREA_OPTION) {
      setSavedCustomLakeAreas((prev) => buildAreaHistory(form.area, prev));
    }
    if (catchAreaSelector === CUSTOM_SEA_AREA_OPTION) {
      setSavedCustomSeaAreas((prev) => buildAreaHistory(form.area, prev));
    }
    setForm((prev) => ({
      ...prev,
      originCity: prev.originCity || prev.municipality || "",
      waterType: prev.waterType || "",
      landingPlace: prev.landingPlace || "",
      gearCount: prev.gearCount || "",
      fishingDurationDays: prev.fishingDurationDays || "",
      selectedVesselId: commercialFishingVesselOptions[0] || "",
      fishingWithoutVessel: false,
      netHeight: prev.netHeight || "",
      netMeshSize: prev.netMeshSize || "",
      fykeHeight: prev.fykeHeight || "",
      notes: "",
      price_per_kg: "",
      date: today(),
      listForSale: false,
      offerToShops: false,
      offerToRestaurants: false,
      offerToWholesalers: false,
      deliveryPossible: false,
      deliveryMethod: "Nouto",
      transportMode: "",
      originPointId: "",
      transportCompanyId: "north-fresh-logistics",
      pickupAddress: "",
      pickupSurcharge: "",
    estimatedPickupTime: "",
    pickupPostal: "",
    deliveryAddress: "",
    deliveryPostal: "",
    palletType: "EUR-lava",
    palletCount: "1",
      tailLift: false,
    pickupWindow: "",
    deliveryWindow: "",
    transportNotes: "",
    deliveryDestinations: prev.deliveryDestinations || [],
      deliveryArea: formatDeliveryDestinations(prev.deliveryDestinations) || prev.deliveryArea || "",
      deliveryCost: "",
      earliestDeliveryDate: today(),
      coldTransport: false,
    }));
    setSpeciesRows([createSpeciesRow()]);
    setRefreshTick((prev) => prev + 1);
    setActiveTab("entries");
  };

  const handleSaveProcessed = async () => {
    if (!profile) return;
    if (!processedForm.productName.trim() || Number(processedForm.kilos || 0) <= 0) {
      setAuthError("Täytä jaloste-erälle vähintään tuotenimi ja määrä kiloina.");
      return;
    }
    if (processedForm.listForSale && processedForm.deliveryPossible && processedForm.deliveryMethod === "Kuljetus järjestetään") {
      if (!currentProcessedOriginCity) {
        setAuthError("Valitse lähtöpaikka ennen toimitettavan jaloste-erän tallennusta.");
        return;
      }
      if (!processedForm.transportMode) {
        setAuthError("Valitse kuljetuksen luovutustapa ennen jaloste-erän tarjouksen lähetystä.");
        return;
      }
      if (processedForm.transportMode === "pickup" && !resolvedProcessedPickupAddress) {
        setAuthError("Täytä nouto-osoite ennen jaloste-erän tarjouksen lähetystä.");
        return;
      }
      if ((processedForm.transportMode === "terminal" || processedForm.transportMode === "collection_point") && !processedForm.originPointId) {
        setAuthError("Valitse terminaali tai keräilypiste ennen jaloste-erän tarjouksen lähetystä.");
        return;
      }
      if (!Array.isArray(processedForm.deliveryDestinations) || processedForm.deliveryDestinations.length === 0) {
        setAuthError("Valitse vähintään yksi toimituskohde jaloste-erälle tai käytä Ehdota kohteet -toimintoa.");
        return;
      }
      const unsupportedDestinations = processedForm.deliveryDestinations.filter((city) => !getRoutePrice(processedForm.originPointId, city, Number(processedForm.kilos || 0)));
      if (unsupportedDestinations.length > 0) {
        setAuthError(`Toimitushinta puuttuu kohteille: ${unsupportedDestinations.join(", ")}`);
        return;
      }
    }

    setSaving(true);
    const processedRecipePayload = buildProcessedRecipePayload(processedRecipeRows);
    const processedNutritionPayload = processedNutritionPreview.complete ? processedNutritionPreview.nutrition : null;

    if (saveProcessedAsProduct) {
      const productPayload = buildProcessedProductPayload(processedForm, profile.id, processedRecipePayload, processedNutritionPayload);
      const productQuery = selectedProcessedProductId
        ? supabase.from("processed_products").update(productPayload).eq("id", selectedProcessedProductId).eq("owner_user_id", profile.id)
        : supabase.from("processed_products").insert(productPayload).select("id").single();
      const { data: savedProductRow, error: savedProductError } = await productQuery;
      if (savedProductError) {
        setSaving(false);
        if (isMissingRefreshTokenError(savedProductError)) {
          await invalidateSession();
          return;
        }
        setAuthError(savedProductError.message);
        return;
      }
      if (!selectedProcessedProductId && savedProductRow?.id) {
        setSelectedProcessedProductId(savedProductRow.id);
      }
    }

    let batchId;
    try {
      batchId = await generateBatchId({
        sourceIdentifier: getProcessedBatchSourceIdentifier(profile),
        date: processedForm.productionDate,
        speciesLabels: (processedForm.speciesSummary
          .split("\n")
          .map((row) => String(row).split(":")[0].trim())
          .filter(Boolean).length > 0
          ? processedForm.speciesSummary
              .split("\n")
              .map((row) => String(row).split(":")[0].trim())
              .filter(Boolean)
          : [processedForm.productName]),
        quantity: processedForm.kilos,
        supabaseClient: supabase,
        ownerUserId: profile.id,
      });
    } catch (error) {
      setSaving(false);
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setAuthError(error.message || "Batch ID:n luonti epäonnistui.");
      return;
    }
    const payload = {
      batch_id: batchId,
      production_date: processedForm.productionDate,
      best_before_date: processedForm.bestBeforeDate || null,
      use_by_date: processedForm.useByDate || null,
      area: processedForm.area,
      municipality: processedForm.municipality,
      origin_city: processedForm.originCity || processedForm.municipality || null,
      spot: processedForm.spot,
      product_name: processedForm.productName.trim(),
      product_type: processedForm.productType,
      processing_method: processedForm.processingMethod,
      product_state: processedForm.productState || null,
      species_name_fi: processedForm.speciesNameFi.trim() || null,
      species_name_scientific: processedForm.speciesNameScientific.trim() || null,
      gear_type: processedForm.gearType.trim() || null,
      species_summary: processedForm.speciesSummary.trim(),
      ingredients: processedForm.ingredients.trim() || null,
      allergens: processedForm.allergens.trim() || null,
      storage_temperature: processedForm.storageTemperature || null,
      storage_instructions: processedForm.storageInstructions.trim() || null,
      recipe_items: processedRecipePayload.length > 0 ? processedRecipePayload : null,
      nutrition_per_100g: processedNutritionPayload,
      kilos: Number(processedForm.kilos || 0),
      package_size_g: processedForm.packageSizeG === "" ? null : Number(processedForm.packageSizeG),
      package_count: processedForm.packageCount === "" ? null : Number(processedForm.packageCount),
      notes: processedForm.notes,
      offer_to_shops: processedForm.listForSale ? processedForm.offerToShops : false,
      offer_to_restaurants: processedForm.listForSale ? processedForm.offerToRestaurants : false,
      offer_to_wholesalers: processedForm.listForSale ? processedForm.offerToWholesalers : false,
      delivery_possible: processedForm.listForSale ? Boolean(processedForm.deliveryPossible) : false,
      delivery_method: processedForm.listForSale ? processedForm.deliveryMethod : null,
      transport_mode: processedForm.listForSale ? (processedForm.transportMode || null) : null,
      origin_point_id: processedForm.listForSale ? (processedForm.originPointId || null) : null,
      transport_company_id: processedForm.listForSale ? (processedForm.transportCompanyId || null) : null,
      pickup_address: processedForm.listForSale ? (resolvedProcessedPickupAddress || null) : null,
      delivery_destinations: processedForm.listForSale ? processedForm.deliveryDestinations : [],
      delivery_area: processedForm.listForSale ? derivedProcessedDeliveryArea : null,
      delivery_cost: processedForm.listForSale && processedForm.deliveryCost !== "" ? Number(processedForm.deliveryCost) : null,
      earliest_delivery_date: processedForm.listForSale ? (processedForm.earliestDeliveryDate || null) : null,
      cold_transport: processedForm.listForSale ? processedForm.coldTransport : false,
      commercial_fishing_id: profile.commercial_fishing_id || null,
      owner_user_id: profile.id,
      owner_name: profile.display_name,
    };

    const { data: insertedProcessedBatch, error } = await supabase.from("processed_batches").insert(payload).select("id").single();
    if (error) {
      setSaving(false);
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setAuthError(error.message);
      return;
    }

    if (selectedProcessedSourceEntries.length > 0) {
      const sourcePayload = selectedProcessedSourceEntries.map((entry) => ({
        processed_batch_id: insertedProcessedBatch.id,
        source_entry_id: entry.id,
        source_batch_id: entry.batchId,
        source_species: entry.species,
        source_kilos: Number(entry.kilos || 0),
      }));
      const { error: sourceInsertError } = await supabase.from("processed_batch_sources").insert(sourcePayload);
      if (sourceInsertError) {
        setSaving(false);
        if (isMissingRefreshTokenError(sourceInsertError)) {
          await invalidateSession();
          return;
        }
        setAuthError(sourceInsertError.message);
        return;
      }
    }

    try {
      const emailResult = await sendProcessedOfferEmail({ formState: processedForm, profileState: profile, batchId });
      if (shouldSendProcessedOffer) {
        if (emailResult.skipped) {
          const parts = ["Jaloste-erä tallennettu, mutta yhtään ostajaa ei täyttänyt tarjousehtoja."];
          setAuthInfo(parts.join(String.fromCharCode(10)));
        } else {
          const parts = [`Jaloste-erä tallennettu. Tarjous lähetetty ${emailResult.sent.length} ostajalle.`];
          const skippedPushCount = emailResult.sent.filter((item) => item.pushSkipped).length;
          if (skippedPushCount > 0) {
            parts.push("", `Push-ilmoitus ei lähtenyt ${skippedPushCount} ostajalle.`);
          }
          if (emailResult.failed.length > 0) {
            parts.push("", `Tarjouksen lähetys epäonnistui ${emailResult.failed.length} ostajalle.`);
          }
          if (emailResult.failed.length > 0) {
            setAuthError(parts.join(String.fromCharCode(10)));
            setAuthInfo("");
          } else {
            setAuthInfo(parts.join(String.fromCharCode(10)));
          }
        }
      } else {
        setAuthInfo("Jaloste-erä tallennettu.");
      }
    } catch (emailError) {
      setAuthError(`Jaloste-erä tallennettu, mutta tarjoussähköpostin lähetys epäonnistui: ${String(emailError?.message || emailError)}`);
      setAuthInfo("");
    }

    setSaving(false);
    setSelectedProcessedProductId("");
    setSaveProcessedAsProduct(false);
    setProcessedRecipeRows([createProcessedRecipeRow()]);
    setProcessedAreaSelector("Saimaa");
    setProcessedForm(createInitialProcessedForm());
    setRefreshTick((prev) => prev + 1);
    setActiveTab("entries");
  };

  const handleDeleteProcessedEntry = async (entry) => {
    const ok = window.confirm(`Poistetaanko jaloste-erä: ${entry.productName} ${entry.kilos} kg / ${entry.productionDate}?`);
    if (!ok) return;

    const { error } = await supabase.from("processed_batches").delete().eq("id", entry.id);
    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setAuthError(error.message);
      return;
    }

    setAuthInfo("Jaloste-erä poistettu.");
    setRefreshTick((prev) => prev + 1);
  };

  const openProcessedLabelPrint = (entry, printFormat, mode = "print") => {
    if (!entry || !profile) return;

    if (!entry.productName && !entry.batchId) {
      setAuthError("Jaloste-etikettiä ei voi tulostaa ilman tuotenimeä tai erätunnusta.");
      return;
    }

    if (mode === "pdf" || (mode === "print" && isNativeCapacitorApp())) {
      void (async () => {
        try {
          const doc = await buildProcessedLabelPdf(entry, profile, printFormat);
          await presentPdfDocument(doc, buildProcessedLabelPdfFileName(entry, printFormat));
        } catch (error) {
          console.error("Jaloste-etiketti-PDF:n luonti epäonnistui:", error);
          setAuthError(`Jaloste-etiketti-PDF:n luonti epäonnistui: ${String(error?.message || error)}`);
        }
      })();
      return;
    }

    const html = buildProcessedLabelPrintHtml(entry, profile, printFormat);
    const printWindow = window.open("", "_blank", "width=1200,height=900");
    if (!printWindow) {
      setAuthError("Tulostusikkunan avaaminen estettiin selaimessa.");
      return;
    }

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const blobUrl = window.URL.createObjectURL(blob);
    let cleanedUp = false;

    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      window.setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
      }, 2000);
    };

    printWindow.onload = () => {
      window.setTimeout(() => {
        try {
          printWindow.focus();
          printWindow.print();
        } catch (error) {
          console.error("Jaloste-etikettien tulostus epäonnistui:", error);
        } finally {
          cleanup();
        }
      }, mode === "pdf" ? 450 : 300);
    };

    try {
      printWindow.location.href = blobUrl;
    } catch (error) {
      cleanup();
      throw error;
    }
  };

  const handleDeleteEntry = async (entry) => {
    const ok = window.confirm(`Poistetaanko saalistieto: ${formatSpeciesForSale(entry.species)} ${entry.kilos} kg / ${entry.date}?`);
    if (!ok) return;

    const { error } = await supabase.from("catch_entries").delete().eq("id", entry.id);
    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setAuthError(error.message);
      return;
    }

    setAuthInfo("Saalistieto poistettu.");
    setRefreshTick((prev) => prev + 1);
  };

  const openCatchLabelPrintDialog = (entry, mode = "print", overrides = {}) => {
    const targetEntry = overrides?.entry || entry;
    if (!targetEntry) return;
    if (profile?.role === "member" && !hasFisherPremium) {
      showFisherPremiumRequired("Etikettien tulostus ja jäljitettävyystunnus");
      return;
    }
    const resolvedLabelCount = Math.max(1, Number(overrides?.labelCount ?? labelPrintCount ?? 1));
    const resolvedPrintFormat = String(overrides?.printFormat || labelPrintFormat || CATCH_LABEL_FORMAT_MUNBYN_4X6);
    const storedCatchDefaults = getStoredCatchFormDefaults(profile);
    const resolvedWaterType = isThermalCatchLabelFormat(resolvedPrintFormat)
      ? String(overrides?.waterType || labelPrintWaterType || targetEntry?.waterType || profile?.water_type || storedCatchDefaults.waterType || "").trim()
      : String(targetEntry?.waterType || profile?.water_type || storedCatchDefaults.waterType || "").trim();
    const labelData = buildCatchLabelData(targetEntry, profile, 1, resolvedLabelCount, { waterType: resolvedWaterType });

    if (!labelData.species || !labelData.batchId || !labelData.supplier) {
      setAuthError("Etikettiä ei voi tulostaa ennen kuin kalalaji, erätunnus ja toimittaja ovat täytetty.");
      return;
    }

    if (isThermalCatchLabelFormat(resolvedPrintFormat) && !resolvedWaterType) {
      setAuthError("Valitse vesityyppi ennen MUNBYN-etiketin tulostusta.");
      return;
    }

    setLabelPrintEntry(null);

    if (mode === "pdf" || (mode === "print" && isNativeCapacitorApp())) {
      void (async () => {
        try {
          const doc = await buildCatchLabelPdf(targetEntry, { ...profile, water_type: resolvedWaterType }, resolvedLabelCount, resolvedPrintFormat);
          await presentPdfDocument(doc, buildCatchLabelPdfFileName(targetEntry), {
            nativeFileName: buildUniqueCatchLabelNativeFileName(targetEntry),
            dedupeKey: `${String(targetEntry?.id || targetEntry?.batchId || "label")}::${resolvedPrintFormat}::${resolvedLabelCount}::${resolvedWaterType}::${Date.now()}`,
          });
        } catch (error) {
          console.error("Etiketti-PDF:n luonti epäonnistui:", error);
          setAuthError(`Etiketti-PDF:n luonti epäonnistui: ${String(error?.message || error)}`);
        }
      })();
      return;
    }
    const html = buildCatchLabelPrintHtml(targetEntry, { ...profile, water_type: resolvedWaterType }, resolvedLabelCount, resolvedPrintFormat);
    const printWindow = window.open("", "_blank", "width=1200,height=900");
    if (!printWindow) {
      setAuthError("Tulostusikkunan avaaminen estettiin selaimessa.");
      return;
    }

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const blobUrl = window.URL.createObjectURL(blob);
    let cleanedUp = false;

    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      window.setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
      }, 2000);
    };

    printWindow.onload = () => {
      window.setTimeout(() => {
        try {
          printWindow.focus();
          printWindow.print();
        } catch (error) {
          console.error("Etikettien tulostus epäonnistui:", error);
        } finally {
          cleanup();
        }
      }, mode === "pdf" ? 450 : 300);
    };

    try {
      printWindow.location.replace(blobUrl);
    } catch (error) {
      cleanup();
      console.error("Etikettinäkymän avaaminen epäonnistui:", error);
      setAuthError("Etikettinäkymän avaaminen epäonnistui.");
    }
  };

  if (publicBatchId) {
    return <PublicBatchView batchId={publicBatchId} data={publicBatchData} loading={publicBatchLoading} error={publicBatchError} />;
  }

  if (loading) {
    return (
      <div style={styles.app}>
        <div style={styles.container}>
          <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
            <strong>{slowBoot ? "Yhdistetään palveluun..." : "Ladataan..."}</strong>
            {slowBoot ? <div style={styles.muted}>Ensimmäinen avaus tai tarjouslinkki voi kestää hetken, jos selain hakee istunnon ja datan uudelleen.</div> : null}
          </div>
        </div>
      </div>
    );
  }

  if (authMode === "recovery" || !session || !profile) {
    return <AuthView authMode={authMode} setAuthMode={setAuthMode} authForm={authForm} setAuthForm={setAuthForm} onSignIn={handleSignIn} onSignUp={handleSignUp} onForgotPassword={handleForgotPassword} onResetRecoveredPassword={handleResetRecoveredPassword} authError={authError} authInfo={authInfo} authSubmitting={authSubmitting} viewportWidth={viewportWidth} />;
  }

  if (!profile.is_active && availableRoleOptions.length === 0) {
    return <PendingApprovalView profile={profile} onLogout={handleLogout} />;
  }

  if (roleSelectionOpen && availableRoleOptions.length > 1) {
    return <RoleSelectionView roleOptions={availableRoleOptions} buyers={buyers} onSelectRole={handleRoleSelect} />;
  }

  if (profile.role === "buyer") {
    const missingBuyerTradeFields = getMissingBuyerTradeFields(linkedBuyerRecord, profile);
    const buyerTradeProfileIncomplete = missingBuyerTradeFields.length > 0;

    const formatOfferDate = (value) => {
      if (!value) return "-";
      try {
        return new Date(value).toLocaleString("fi-FI", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
      } catch {
        return String(value || "-");
      }
    };

    const formatOfferDay = (value) => {
      if (!value) return "Ei päivämäärää";
      try {
        return new Date(value).toLocaleDateString("fi-FI", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });
      } catch {
        return String(value || "Ei päivämäärää");
      }
    };

    const buildOfferHeadline = (offer) => {
      if (isMixedOffer(offer)) return "Monilajinen erä";
      const speciesHeadline = getOfferSpeciesHeadline(offer?.species_summary, { hideTraceability: true }) || "Kalaerä";
      const quantity = getOfferQuantityDisplay(offer);
      return quantity && quantity !== "-" ? `${speciesHeadline} · ${quantity}` : speciesHeadline;
    };

    const getVisibleOfferPrice = (offer) => {
      if (offer?.counter_price_per_kg !== "" && offer?.counter_price_per_kg != null) return offer.counter_price_per_kg;
      if (offer?.price_per_kg !== "" && offer?.price_per_kg != null) return offer.price_per_kg;
      if (offer?.price_per_kg_fallback !== "" && offer?.price_per_kg_fallback != null) return offer.price_per_kg_fallback;
      const parsedFromNotes = parsePricePerKgFromNotes(offer?.notes);
      if (parsedFromNotes !== "" && parsedFromNotes != null) return parsedFromNotes;
      return "";
    };

    const filteredBuyerOffers = (buyerOffers || []).filter((offer) => {
      const q = buyerOffersSearch.trim().toLowerCase();
      const statusOk = buyerOffersFilter === "all"
        ? true
        : buyerOffersFilter === "open"
        ? hasBuyerOfferStatus(offer.status, [...BUYER_OFFER_OPEN_RESPONSE_STATUSES, ...BUYER_OFFER_ACTION_REQUIRED_STATUSES, "sold"])
        : buyerOffersFilter === "accepted"
        ? isBuyerOfferAccepted(offer.status)
        : offer.status === buyerOffersFilter;
      const text = [offer.seller_name, offer.area, offer.spot, offer.species_summary, offer.status, offer.buyer_message]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return statusOk && (!q || text.includes(q));
    });

    const groupedByDay = filteredBuyerOffers.reduce((acc, offer) => {
      const key = formatOfferDay(offer.updated_at || offer.created_at);
      if (!acc[key]) acc[key] = [];
      acc[key].push(offer);
      return acc;
    }, {});

    const orderedGroups = Object.entries(groupedByDay).sort((a, b) => {
      const aTime = new Date((a[1]?.[0]?.updated_at || a[1]?.[0]?.created_at || 0)).getTime();
      const bTime = new Date((b[1]?.[0]?.updated_at || b[1]?.[0]?.created_at || 0)).getTime();
      return bTime - aTime;
    });
    const todayLabel = formatOfferDay(new Date().toISOString());
    const acceptedBuyerOffers = (buyerOffers || []).filter(
      (offer) => isBuyerOfferAccepted(offer.status) && formatOfferDay(offer.updated_at || offer.created_at) === todayLabel
    );
    const buyerInvoiceOffers = (buyerOffers || [])
      .filter((offer) => ["invoiced", "paid"].includes(String(offer.billing_status || "")))
      .sort((a, b) => {
        const aTime = new Date(a.paid_at || a.billed_at || a.updated_at || a.created_at || 0).getTime();
        const bTime = new Date(b.paid_at || b.billed_at || b.updated_at || b.created_at || 0).getTime();
        return bTime - aTime;
      });
    const logoHeight = viewportWidth < 768
      ? 172
      : viewportWidth < 1024
      ? 206
      : 228;

    return (
      <div style={styles.app}>
        <div style={styles.container}>
          <div style={{ ...styles.card, ...styles.headerCard }}>
            <div style={styles.rowBetween}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "nowrap", marginTop: 12, marginBottom: 12 }}>
                  <h1 style={{ ...styles.title, marginRight: -2 }}>Suoraan Kalastajalta</h1>
                  <img
                    src="/logo.png"
                    alt=""
                    style={{
                      height: logoHeight,
                      width: "auto",
                      maxWidth: viewportWidth < 768 ? "46vw" : "none",
                      objectFit: "contain",
                      display: "block",
                      flexShrink: 0,
                      marginLeft: viewportWidth < 768 ? -10 : -6,
                    }}
                  />
              </div>
              <p style={styles.subtitle}>Kirjautunut: <strong>{profile.display_name}</strong> · Rooli: <strong>{roleLabel(profile?.role)}</strong></p>
            </div>
            <div style={styles.toolbar}>
              {availableRoleOptions.length > 1 ? (
                <select
                  style={styles.input}
                  value={activeRoleOption?.id || ""}
                  onChange={(e) => {
                    const selectedRole = availableRoleOptions.find((option) => String(option.id) === String(e.target.value));
                    if (selectedRole) {
                      handleRoleSelect(selectedRole);
                    }
                  }}
                >
                  {availableRoleOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {buildRoleOptionLabel(option, buyers)}
                    </option>
                  ))}
                </select>
              ) : null}
              <div style={viewportWidth < 560 ? {
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 8,
                width: "100%",
              } : styles.toolbarActions}>
                <button type="button" style={viewportWidth < 560 ? { ...styles.button, minWidth: 0, padding: "11px 8px", fontSize: 14 } : styles.button} onClick={handleManualRefresh}>Päivitä</button>
                <button type="button" style={viewportWidth < 560 ? { ...styles.button, minWidth: 0, padding: "11px 8px", fontSize: 14 } : styles.button} onClick={() => setAccountPanelOpen((prev) => !prev)}>{accountPanelOpen ? "Sulje tiedot" : "Omat tiedot"}</button>
                <button type="button" style={viewportWidth < 560 ? { ...styles.button, minWidth: 0, padding: "11px 8px", fontSize: 14 } : styles.button} onClick={handleLogout}>Kirjaudu ulos</button>
              </div>
            </div>
            </div>
          </div>

          {accountPanelOpen ? (
            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack, marginBottom: 16 }}>
              <div style={styles.rowBetween}>
                <div>
                  <strong>Omat tiedot</strong>
                  <div style={styles.muted}>Päivitä käyttäjänimi, yrityksen tiedot ja salasana.</div>
                </div>
                <span style={styles.badge}>{profile.email}</span>
              </div>
              <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack, background: "#f8fafc" }}>
                <strong>Profiili</strong>
                <div style={styles.field}>
                  <label>Käyttäjän nimi</label>
                  <input style={styles.input} value={accountForm.displayName} onChange={(e) => setAccountForm((prev) => ({ ...prev, displayName: e.target.value }))} placeholder="Nimi" />
                </div>
                <div style={styles.field}>
                  <label>Kirjautumissähköposti</label>
                  <input style={styles.input} value={profile.email || ""} disabled />
                </div>
                {linkedBuyerRecord ? (
                  <>
                    <div style={styles.field}>
                      <label>Yritys</label>
                      <input style={styles.input} value={accountForm.companyName} onChange={(e) => setAccountForm((prev) => ({ ...prev, companyName: e.target.value }))} placeholder="Yrityksen nimi" />
                    </div>
                    <div style={styles.field}>
                      <label>Yhteyshenkilö</label>
                      <input style={styles.input} value={accountForm.contactName} onChange={(e) => setAccountForm((prev) => ({ ...prev, contactName: e.target.value }))} placeholder="Yhteyshenkilö" />
                    </div>
                    <div style={styles.field}>
                      <label>Puhelin</label>
                      <input style={styles.input} value={accountForm.phone} onChange={(e) => setAccountForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="Puhelin" />
                    </div>
                    <div style={styles.field}>
                      <label>Paikkakunta</label>
                      <MunicipalitySelect value={accountForm.city} onChange={(e) => setAccountForm((prev) => ({ ...prev, city: e.target.value }))} />
                    </div>
                    <div style={styles.field}>
                      <label>Min ostomäärä (kg)</label>
                      <input style={styles.input} type="number" value={accountForm.minKg} onChange={(e) => setAccountForm((prev) => ({ ...prev, minKg: e.target.value }))} placeholder="Esim. 10" />
                    </div>
                    <div style={styles.field}>
                      <label>Max ostomäärä (kg)</label>
                      <input style={styles.input} type="number" value={accountForm.maxKg} onChange={(e) => setAccountForm((prev) => ({ ...prev, maxKg: e.target.value }))} placeholder="Esim. 200" />
                    </div>
                    <div style={{ ...styles.noticeInfo, marginTop: -4 }}>
                      Jätä kenttä tyhjäksi tai aseta arvoksi 0, jos et halua ostomäärälle rajaa.
                    </div>
                    <div style={styles.field}>
                      <label>Toimitusosoite</label>
                      <input style={styles.input} value={accountForm.deliveryAddress} onChange={(e) => setAccountForm((prev) => ({ ...prev, deliveryAddress: e.target.value }))} placeholder="Katuosoite" />
                    </div>
                    <div style={styles.field}>
                      <label>Toimitus postinumero</label>
                      <input style={styles.input} value={accountForm.deliveryPostcode} onChange={(e) => setAccountForm((prev) => ({ ...prev, deliveryPostcode: e.target.value }))} placeholder="00100" />
                    </div>
                    <div style={styles.field}>
                      <label>Toimitus kaupunki</label>
                      <MunicipalitySelect value={accountForm.deliveryCity} onChange={(e) => setAccountForm((prev) => ({ ...prev, deliveryCity: e.target.value }))} />
                    </div>
                    <div style={styles.field}>
                      <label>Laskutusosoite</label>
                      <input style={styles.input} value={accountForm.billingAddress} onChange={(e) => setAccountForm((prev) => ({ ...prev, billingAddress: e.target.value }))} placeholder="Katuosoite" />
                    </div>
                    <div style={styles.field}>
                      <label>Laskutus postinumero</label>
                      <input style={styles.input} value={accountForm.billingPostcode} onChange={(e) => setAccountForm((prev) => ({ ...prev, billingPostcode: e.target.value }))} placeholder="00100" />
                    </div>
                    <div style={styles.field}>
                      <label>Laskutus kaupunki</label>
                      <MunicipalitySelect value={accountForm.billingCity} onChange={(e) => setAccountForm((prev) => ({ ...prev, billingCity: e.target.value }))} />
                    </div>
                    <div style={styles.field}>
                      <label>Laskutussähköposti</label>
                      <input style={styles.input} type="email" value={accountForm.billingEmail} onChange={(e) => setAccountForm((prev) => ({ ...prev, billingEmail: e.target.value }))} placeholder="laskutus@yritys.fi" />
                    </div>
                    <div style={styles.field}>
                      <label>Y-tunnus</label>
                      <input style={styles.input} value={accountForm.businessId} onChange={(e) => setAccountForm((prev) => ({ ...prev, businessId: e.target.value }))} placeholder="1234567-8" />
                    </div>
                    <div style={styles.field}>
                      <label>Onko toiminta ALV-velvollista?</label>
                      <select style={styles.input} value={accountForm.vatLiable ? "yes" : "no"} onChange={(e) => setAccountForm((prev) => ({ ...prev, vatLiable: e.target.value === "yes", ...(e.target.value === "yes" ? {} : { vatNumber: "" }) }))}>
                        <option value="no">Ei</option>
                        <option value="yes">Kyllä</option>
                      </select>
                    </div>
                    {accountForm.vatLiable ? (
                      <div style={styles.field}>
                        <label>ALV-numero</label>
                        <input style={styles.input} value={accountForm.vatNumber} onChange={(e) => setAccountForm((prev) => ({ ...prev, vatNumber: e.target.value.toUpperCase() }))} placeholder="Esim. FI12345678" />
                      </div>
                    ) : null}
                    <div style={styles.field}>
                      <label>Lisätiedot</label>
                      <textarea style={styles.textarea} value={accountForm.notes} onChange={(e) => setAccountForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Toimitusohjeet, huomioita" />
                    </div>
                  </>
                ) : (
                  <div style={styles.noticeInfo}>Tälle ostajakäyttäjälle ei löytynyt linkitettyä ostajarekisterin yritystä. Nimi ja salasana voidaan silti päivittää.</div>
                )}
                <div style={{ ...styles.row, justifyContent: "flex-end" }}>
                  <button style={{ ...styles.button, ...styles.primaryButton }} onClick={handleSaveOwnDetails} disabled={accountSaving}>{accountSaving ? "Tallennetaan..." : "Tallenna tiedot"}</button>
                </div>
              </div>
              <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack, background: "#f8fafc" }}>
                <strong>Vaihda salasana</strong>
                <div style={styles.field}>
                  <label>Uusi salasana</label>
                  <input style={styles.input} type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))} placeholder="Vähintään 8 merkkiä" />
                </div>
                <div style={styles.field}>
                  <label>Uusi salasana uudelleen</label>
                  <input style={styles.input} type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))} placeholder="Kirjoita salasana uudelleen" />
                </div>
                <div style={styles.muted}>Salasanan vaihto tehdään heti nykyiselle käyttäjätilille.</div>
                <div style={{ ...styles.row, justifyContent: "flex-end" }}>
                  <button style={{ ...styles.button, ...styles.primaryButton }} onClick={handleChangePassword} disabled={passwordSaving}>{passwordSaving ? "Vaihdetaan..." : "Vaihda salasana"}</button>
                </div>
              </div>
            </div>
          ) : null}

          {authError ? <div style={{ ...styles.noticeError, marginBottom: 16 }}>{authError}</div> : null}
          {authInfo ? <div style={{ ...styles.noticeSuccess, marginBottom: 16 }}>{authInfo}</div> : null}
          <FirstUseGuideCard
            profile={profile}
            guideState={onboardingGuideState}
            onDismissNow={dismissOnboardingGuideNow}
            onHideForever={hideOnboardingGuideForever}
            viewportWidth={viewportWidth}
          />

          <div style={styles.stickyTabsWrap}>
            <div style={{ ...styles.tabs6, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
              <button
                style={{
                  ...styles.tab,
                  minWidth: 0,
                  whiteSpace: "nowrap",
                  padding: viewportWidth < 520 ? "14px 10px" : styles.tab.padding,
                  fontSize: viewportWidth < 520 ? 16 : styles.tab.fontSize,
                  ...((activeTab === "offers" || activeTab === "dashboard") ? styles.activeTab : {}),
                }}
                onClick={() => setActiveTab("offers")}
              >
                Tarjoukset
              </button>
              <button
                style={{
                  ...styles.tab,
                  minWidth: 0,
                  whiteSpace: "nowrap",
                  padding: viewportWidth < 520 ? "14px 10px" : styles.tab.padding,
                  fontSize: viewportWidth < 520 ? 16 : styles.tab.fontSize,
                  ...(activeTab === "reports" ? styles.activeTab : {}),
                }}
                onClick={() => setActiveTab("reports")}
              >
                Raportit
              </button>
              <button
                style={{
                  ...styles.tab,
                  minWidth: 0,
                  whiteSpace: "nowrap",
                  padding: viewportWidth < 520 ? "14px 10px" : styles.tab.padding,
                  fontSize: viewportWidth < 520 ? 16 : styles.tab.fontSize,
                  ...(activeTab === "buyer_billing" ? styles.activeTab : {}),
                }}
                onClick={() => setActiveTab("buyer_billing")}
              >
                Laskut
              </button>
            </div>
          </div>

          {activeTab === "reports" ? (
            <ReportsView entries={entries} processedEntries={processedEntries} offers={offers} profile={profile} />
          ) : null}

          {activeTab === "buyer_billing" ? (
            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
              <div style={styles.rowBetween}>
                <div>
                  <strong>Minulle lähetetyt laskut</strong>
                  <div style={styles.muted}>Tässä näkyvät kaikki juuri tälle ostajalle sovelluksesta lähetetyt laskut ja niiden tila.</div>
                </div>
                <span style={styles.badge}>{buyerInvoiceOffers.length} laskua</span>
              </div>
              <div style={styles.noticeInfo}>
                Muista kuitata kalaerä vastaanotetuksi heti kun olet saanut toimituksen. Kalastaja voi lähettää laskun vasta sen jälkeen.
              </div>
              {buyerInvoiceOffers.length === 0 ? (
                <div style={styles.muted}>Tälle ostajalle ei ole vielä lähetetty laskuja.</div>
              ) : buyerInvoiceOffers.map((offer) => {
                const sellerProfileLike = {
                  company_name: offer.seller_name || offer.seller_company_name || offer.sellerCompanyNameFallback || "",
                  display_name: offer.seller_name || offer.sellerDisplayNameFallback || "",
                  business_id: resolveBuyerVisibleSellerBusinessId(offer, getBuyerVisibleSellerInfo(offer)) || "",
                  address: offer.seller_address || offer.sellerAddressFallback || "",
                  postcode: offer.seller_postcode || offer.sellerPostcodeFallback || "",
                  city: offer.seller_city || offer.sellerCityFallback || "",
                  contact_email: offer.seller_contact_email || offer.sellerContactEmailFallback || "",
                  email: offer.seller_email || offer.sellerEmail || "",
                  phone: offer.seller_phone || offer.sellerPhone || "",
                  bank_account_iban: offer.seller_bank_account_iban || "",
                  bank_bic: offer.seller_bank_bic || "",
                };
                const invoicePayload = getSellerInvoicePayload(offer, sellerProfileLike);
                const sellerStatusLabel = String(offer.billing_status || "unbilled") === "paid"
                  ? "Maksettu"
                  : String(offer.billing_status || "unbilled") === "invoiced"
                  ? "Lähetetty"
                  : "Laskuttamaton";

                return (
                  <div key={`buyer-invoice-${offer.id}`} style={{ ...styles.entry, background: "#f8fafc" }}>
                    <div style={styles.rowBetween}>
                      <div>
                        <strong>{invoicePayload.sellerName || "Kalastaja"}</strong>
                        <div style={styles.muted}>Lasku: {invoicePayload.invoiceNumber}</div>
                      </div>
                      <span style={{ ...styles.badge, background: "#ecfdf5", borderColor: "#86efac" }}>{sellerStatusLabel}</span>
                    </div>

                    <div style={styles.entryBadges}>
                      <span style={styles.badge}>{euro(invoicePayload.grandTotal)} lasku</span>
                      <span style={styles.badge}>{euro(invoicePayload.netTotal)} veroton</span>
                      <span style={styles.badge}>ALV {(invoicePayload.vatRate * 100).toLocaleString("fi-FI")} % {euro(invoicePayload.vatAmount)}</span>
                    </div>

                    <div style={{ ...styles.muted, whiteSpace: "pre-wrap" }}>
                      <strong>Erä:</strong> {formatSpeciesSummaryText(offer.species_summary, { hideTraceability: false }) || "-"}
                    </div>
                    {invoicePayload.batchId ? <div style={styles.muted}><strong>Erätunnus:</strong> <span style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>{invoicePayload.batchId}</span></div> : null}
                    {invoicePayload.catchDates.length > 0 ? <div style={styles.muted}><strong>Pyyntipäivämäärä:</strong> {invoicePayload.catchDates.join(", ")}</div> : null}
                    <div style={styles.muted}><strong>Laskun päiväys:</strong> {invoicePayload.invoiceDate}</div>
                    <div style={styles.muted}><strong>Eräpäivä:</strong> {invoicePayload.dueDate}</div>
                    <div style={styles.muted}><strong>Viitenumero:</strong> {invoicePayload.referenceDisplay}</div>
                    {invoicePayload.sellerBusinessId ? <div style={styles.muted}><strong>Kalastajan Y-tunnus:</strong> {invoicePayload.sellerBusinessId}</div> : null}
                    {invoicePayload.sellerEmail ? <div style={styles.muted}><strong>Kalastajan sähköposti:</strong> {invoicePayload.sellerEmail}</div> : null}
                    {invoicePayload.sellerPhone ? <div style={styles.muted}><strong>Kalastajan puhelin:</strong> {invoicePayload.sellerPhone}</div> : null}

                    <div style={styles.row}>
                      <button
                        type="button"
                        style={styles.button}
                        onClick={() => handleOpenBuyerInvoicePdf(offer)}
                        disabled={!invoicePayload.sellerIban}
                      >
                        Avaa lasku (PDF)
                      </button>
                    </div>
                    {!invoicePayload.sellerIban ? (
                      <div style={styles.noticeInfo}>PDF tulee näkyviin heti kun laskun maksutiedot ovat mukana tällä laskulla.</div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          {activeTab !== "reports" && activeTab !== "buyer_billing" && acceptedBuyerOffers.length > 0 ? (
            <div style={{ ...styles.successHighlightBox, ...styles.stack, marginBottom: 16 }}>
              <div style={styles.rowBetween}>
                <div>
                  <strong>Kauppa hyväksytty</strong>
                  <div style={styles.muted}>
                    {acceptedBuyerOffers.length === 1
                      ? "Sinulla on 1 hyväksytty kauppa. Tarkemmat tiedot löytyvät alempaa tarjouslistan vetolaatikosta."
                      : `Sinulla on ${acceptedBuyerOffers.length} hyväksyttyä kauppaa. Tarkemmat tiedot löytyvät alempaa tarjouslistan vetolaatikosta.`}
                  </div>
                  <div style={{ ...styles.muted, marginTop: 6 }}>
                    Muista kuitata kalaerä vastaanotetuksi, jotta kalastaja voi lähettää laskun.
                  </div>
                </div>
                <button
                  style={{ ...styles.button, background: "#166534", borderColor: "#166534", color: "#fff" }}
                  onClick={() => setBuyerOffersFilter("accepted")}
                >
                  Näytä hyväksytyt
                </button>
              </div>
            </div>
          ) : null}

          {activeTab !== "reports" && activeTab !== "buyer_billing" ? (
          <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
            <div style={styles.rowBetween}>
              <strong>Minulle tarjotut erät</strong>
              <div style={styles.row}>
                <select style={styles.input} value={buyerOffersFilter} onChange={(e) => setBuyerOffersFilter(e.target.value)}>
                  <option value="open">Avoimet</option>
                  <option value="reserved">Varatut</option>
                  <option value="accepted">Hyväksytyt</option>
                  <option value="countered">Vastatarjoukset</option>
                  <option value="rejected">Hylätyt</option>
                  <option value="all">Kaikki</option>
                </select>
                <input
                  style={{ ...styles.input, width: viewportWidth < 768 ? "100%" : 320, flex: "1 1 320px", minWidth: 0 }}
                  placeholder="Hae myyjällä, alueella, lajilla..."
                  value={buyerOffersSearch}
                  onChange={(e) => setBuyerOffersSearch(e.target.value)}
                />
              </div>
            </div>

            {filteredBuyerOffers.length === 0 ? (
              <div style={styles.muted}>Ei tarjottuja eriä.</div>
            ) : (
              orderedGroups.map(([dayLabel, offersForDay]) => (
                <div key={dayLabel} style={styles.stack}>
                  <div style={{ ...styles.card, ...styles.sectionCard, padding: "12px 16px", background: "#eff6ff", borderColor: "#bfdbfe" }}>
                    <strong style={{ fontSize: 18 }}>{dayLabel}</strong>
                  </div>

                  {offersForDay.map((o) => {
                    const isActive = buyerActiveOfferId === o.id;
                    const visiblePrice = getVisibleOfferPrice(o);
                    const sellerInfo = getBuyerVisibleSellerInfo(o);
                    const mixedOffer = isMixedOffer(o);
                    const offerCountDisplay = getOfferCountDisplay(o);
                    const showTraceability = isBuyerOfferAccepted(o.status);
                    const visibleAdditionalNotes = extractVisibleAdditionalNotes(o.notes);
                    const ownDeliveryPrice = o.route_price_eur !== "" && o.route_price_eur != null ? Number(o.route_price_eur) : null;
                    const ownTotalPrice = o.total_price_eur !== "" && o.total_price_eur != null ? Number(o.total_price_eur) : null;
                    const ownDeliveredPricePerKg = o.delivered_price_per_kg !== "" && o.delivered_price_per_kg != null ? Number(o.delivered_price_per_kg) : null;
                    const offerCatchDates = getOfferSummaryCatchDates(o.species_summary);
                    const buyerOfferActionsOpen = hasBuyerOfferStatus(o.status, BUYER_OFFER_OPEN_RESPONSE_STATUSES);
                    const showCounterAction = isActive && buyerActionMode === "counter";
                    const offerInlineError = buyerOfferInlineError.offerId === String(o?.id || "") ? buyerOfferInlineError.message : "";
                    return (
                      <div key={o.id} style={{ ...styles.entry, borderLeft: "5px solid #0f172a" }}>
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 6 }}>{formatOfferDate(o.updated_at || o.created_at)}</div>
                          <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.15, marginBottom: 8 }}>{buildOfferHeadline(o)}</div>
                          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
                            {mixedOffer ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a" }}>
                                  {getOfferSummaryLines(o.species_summary).length} lajia samassa erässä
                                </div>
                                {offerCatchDates.length > 0 ? (
                                  <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a" }}>
                                    Pyyntipäivä: {offerCatchDates.join(", ")}
                                  </div>
                                ) : null}
                              </div>
                            ) : visiblePrice !== "" && visiblePrice != null ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a" }}>
                                  Hinta ALV 0 %: {euro(visiblePrice)} / {getOfferDisplayUnit(o)}
                                </div>
                                <div style={{ fontSize: 16, fontWeight: 700, color: "#475569" }}>
                                  {`Hinta sis. ALV ${formatVatPercent()} %:`} {euro(calculateGrossPrice(visiblePrice) || 0)} / {getOfferDisplayUnit(o)}
                                </div>
                                {offerCatchDates.length > 0 ? (
                                  <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a" }}>
                                    Pyyntipäivä: {offerCatchDates.join(", ")}
                                  </div>
                                ) : null}
                              </div>
                            ) : offerCatchDates.length > 0 ? (
                              <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a" }}>
                                Pyyntipäivä: {offerCatchDates.join(", ")}
                              </div>
                            ) : null}
                          </div>
                          {showTraceability && o.batch_id && !mixedOffer ? (
                            <div style={{ ...styles.muted, marginBottom: 8 }}>
                              <strong>Erätunnus:</strong>
                              <div style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>{o.batch_id}</div>
                            </div>
                          ) : null}
                          {showTraceability && o.batch_id && !mixedOffer ? <div style={{ ...styles.qrBlock, marginBottom: 8 }}><img src={getBatchQrImageUrl(o.batch_id)} alt={`QR ${o.batch_id}`} style={styles.qrImage} /><div style={styles.small}>QR-koodi erälle</div></div> : null}
                          <div style={styles.entryBadges}>
                            <span style={styles.badge}>{buyerStatusLabel(o.status)}</span>
                            <span style={styles.badge}>{o.area || "-"}</span>
                            {o.status === "reserved" ? <span style={{ ...styles.badge, background: "#fff7ed", borderColor: "#fdba74" }}>Varaus käynnissä</span> : null}
                            {o.status === "countered" ? <span style={{ ...styles.badge, background: "#eff6ff", borderColor: "#93c5fd", color: "#1d4ed8" }}>Vastatarjous lähetetty</span> : null}
                            {o.status === "sold" ? <span style={{ ...styles.badge, background: "#fee2e2", borderColor: "#fca5a5", color: "#b91c1c" }}>MYYTY JO TOISELLE OSTAJALLE</span> : null}
                            <span style={styles.badge}>Tarjoaja: {sellerInfo.sellerLabel}</span>
                          </div>
                        </div>

                        <div style={{ ...(viewportWidth < 768 ? { display: "grid", gridTemplateColumns: "1fr", gap: 18 } : styles.grid2), marginBottom: 10 }}>
                          <div>
                            <div style={styles.muted}><strong>Erän tiedot</strong></div>
                            {mixedOffer ? <div style={{ ...styles.noticeInfo, marginBottom: 8 }}>Tämä monilajinen erä myydään kokonaisuutena. Kalalajit, hinnat ja erätunnukset näkyvät alla riveittäin.</div> : null}
                            <div style={{ ...styles.muted, whiteSpace: "pre-wrap" }}>
                              {mixedOffer
                                ? (formatSpeciesSummaryText(o.species_summary, {
                                    hideTraceability: !showTraceability,
                                    hidePrice: !mixedOffer,
                                    hideCatchDate: !mixedOffer,
                                  }) || "-")
                                : (getOfferSpeciesHeadline(o.species_summary, {
                                    hideTraceability: !showTraceability,
                                  }) || "-")}
                            </div>
                            {!mixedOffer ? <div style={styles.muted}>Määrä: {getOfferQuantityDisplay(o)}</div> : null}
                            {!mixedOffer && offerCountDisplay ? <div style={styles.muted}>Kappalemäärä: {offerCountDisplay}</div> : null}
                            {!mixedOffer && visiblePrice !== "" && visiblePrice != null ? formatNetAndGrossPriceLines(o, visiblePrice).map((line) => <div key={line} style={styles.muted}>{line}</div>) : null}
                            {ownDeliveryPrice != null ? <div style={styles.muted}>Toimitushinta omaan kaupunkiin ({o.delivery_destination_city || linkedBuyerRecord?.delivery_city || linkedBuyerRecord?.city || "-" }): {formatDeliveryPrice(ownDeliveryPrice)}</div> : null}
                            {ownTotalPrice != null ? <div style={styles.muted}>Kokonaishinta: {formatDeliveryPrice(ownTotalPrice)}</div> : null}
                            {ownDeliveredPricePerKg != null ? <div style={styles.muted}>Toimitettuna: {formatDeliveredPricePerKg(ownDeliveredPricePerKg)}</div> : null}
                            <div style={styles.muted}>Tarjoaja: {sellerInfo.sellerLabel}</div>
                            {showTraceability && sellerInfo.sellerCommercialFishingId && sellerInfo.revealIdentity ? <div style={styles.muted}>Kaupallisen kalastajan tunnus: {sellerInfo.sellerCommercialFishingId}</div> : null}
                            <div style={styles.muted}>Kalastamisalue: {sellerInfo.publicLocation}</div>
                            {sellerInfo.publicSpot ? <div style={styles.muted}>Paikka: {sellerInfo.publicSpot}</div> : null}
                          </div>
                          <div>
                            <div style={styles.muted}><strong>Toimitus ja lisätiedot</strong></div>
                            <div style={styles.muted}>Toimitustapa: {sellerInfo.deliveryMethod || "-"}</div>
                            <div style={styles.muted}>Kulu: {ownDeliveryPrice != null ? formatDeliveryPrice(ownDeliveryPrice) : (sellerInfo.deliveryCost !== "" && sellerInfo.deliveryCost != null ? `${sellerInfo.deliveryCost} €` : "-")}</div>
                            <div style={styles.muted}>Aikaisin toimitus: {sellerInfo.earliestDeliveryDate || "-"}</div>
                            <div style={styles.muted}>Kylmäkuljetus: {sellerInfo.coldTransport ? "kyllä" : "ei"}</div>
                            {visibleAdditionalNotes ? <div style={{ ...styles.muted, whiteSpace: "pre-wrap" }}>{visibleAdditionalNotes}</div> : <div style={styles.muted}>Ei lisätietoja</div>}
                          </div>
                        </div>

                        {o.buyer_message ? <div style={styles.muted}>Sinun viesti: {o.buyer_message}</div> : null}
                        {o.status === "accepted" ? (
                          <div style={{ ...styles.noticeSuccess, marginTop: 10 }}>
                            Kauppa hyväksytty. Myyjä hyväksyi tarjouksesi.
                          </div>
                        ) : null}
                        {o.status === "countered" ? (
                          <div style={{ ...styles.noticeInfo, marginTop: 10 }}>
                            Vastatarjous on lähetetty myyjälle. Samasta erästä ei voi tehdä uutta vastatarjousta ennen kuin myyjä reagoi.
                          </div>
                        ) : null}
                        {o.status === "sold" ? (
                          <div style={{ ...styles.noticeError, marginTop: 10 }}>
                            MYYTY JO TOISELLE OSTAJALLE. Tämä erä ei ole enää myynnissä, eikä siihen voi tehdä toimenpiteitä.
                          </div>
                        ) : null}
                        {offerInlineError ? (
                          <div style={{ ...styles.noticeError, marginTop: 12, marginBottom: 12 }}>
                            {offerInlineError}
                          </div>
                        ) : null}

                        <div style={{ ...styles.row, marginTop: 12 }}>
                          {buyerOfferActionsOpen ? (
                            <>
                              <button
                                style={{
                                  ...styles.button,
                                  ...(showCounterAction ? styles.primaryButton : {}),
                                  background: showCounterAction ? "#2563eb" : "#eff6ff",
                                  borderColor: "#93c5fd",
                                  color: showCounterAction ? "#fff" : "#1d4ed8",
                                }}
                                onClick={() => {
                                  if (buyerTradeProfileIncomplete) {
                                    setAccountPanelOpen(true);
                                    setBuyerOfferInlineError({
                                      offerId: String(o?.id || ""),
                                      message: `Täytä omat tiedot ennen kuin voit tehdä vastatarjouksen. Puuttuvat tiedot: ${missingBuyerTradeFields.join(", ")}.`,
                                    });
                                    return;
                                  }
                                  setBuyerOfferInlineError({ offerId: "", message: "" });
                                  if (o.status === "sent") {
                                    void markBuyerOfferViewed(o);
                                  }
                                  setBuyerActionMode("counter");
                                  setBuyerActiveOfferId(isActive && buyerActionMode === "counter" ? null : o.id);
                                }}
                              >
                                {showCounterAction ? "Sulje vastatarjous" : "Tee vastatarjous"}
                              </button>
                              <button
                                style={{
                                  ...styles.button,
                                  background: "#f0fdf4",
                                  borderColor: "#86efac",
                                  color: "#166534",
                                }}
                                onClick={async () => {
                                  if (buyerTradeProfileIncomplete) {
                                    setAccountPanelOpen(true);
                                    setBuyerOfferInlineError({
                                      offerId: String(o?.id || ""),
                                      message: `Täytä omat tiedot ennen kuin voit varata erän. Puuttuvat tiedot: ${missingBuyerTradeFields.join(", ")}.`,
                                    });
                                    return;
                                  }
                                  setBuyerOfferInlineError({ offerId: "", message: "" });
                                  if (o.status === "sent") {
                                    const viewedOk = await markBuyerOfferViewed(o);
                                    if (!viewedOk) return;
                                  }
                                  await onReserve(o);
                                }}
                              >
                                Varaa erä
                              </button>
                            </>
                          ) : (
                            <button style={styles.button} onClick={() => {
                              setBuyerOfferInlineError({ offerId: "", message: "" });
                              setBuyerActiveOfferId(isActive ? null : o.id);
                            }}>
                              {isActive ? "Sulje" : "Näytä tiedot"}
                            </button>
                          )}
                          {o.status === "sold" ? (
                            <button
                              style={{ ...styles.button, background: "#fee2e2", borderColor: "#fca5a5", color: "#b91c1c" }}
                              onClick={() => onRemoveSoldBuyerOffer(o)}
                            >
                              Poista
                            </button>
                          ) : null}
                          {o.status !== "accepted" && o.status !== "sold" ? <button style={{ ...styles.button, background: "#fee2e2", borderColor: "#fca5a5", color: "#b91c1c" }} onClick={() => onRejectBuyerOffer(o)}>Hylkää</button> : null}
                        </div>

                        {isActive ? (
                          <div style={{ ...styles.stack, marginTop: 12 }}>
                            {o.status === "accepted" ? (
                          <div style={styles.noticeSuccess}>
                            Kalastajan täydet tiedot näkyvät alla.
                          </div>
                        ) : null}
                        {o.status === "sold" ? (
                          <div style={styles.noticeError}>MYYTY JO TOISELLE OSTAJALLE. Varaus- ja vastatarjoustoiminnot eivät ole enää käytettävissä.</div>
                        ) : null}
                        {o.status === "accepted" ? (
                          <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack, background: "#f8fafc" }}>
                            <strong>Kalastajan tiedot</strong>
                            <div style={styles.muted}>Nimi: {sellerInfo.sellerName || "-"}</div>
                            <div style={styles.muted}>Y-tunnus: {resolveBuyerVisibleSellerBusinessId(o, sellerInfo) || "-"}</div>
                            {sellerInfo.sellerAddress ? <div style={styles.muted}>Yrityksen osoite: {sellerInfo.sellerAddress}</div> : null}
                            <div style={styles.muted}>Sähköposti: {sellerInfo.sellerEmail || "-"}</div>
                            <div style={styles.muted}>Puhelin: {sellerInfo.sellerPhone || "-"}</div>
                            {sellerInfo.sellerCommercialFishingId ? <div style={styles.muted}>Kaupallisen kalastajan tunnus: {sellerInfo.sellerCommercialFishingId}</div> : null}
                            <div style={styles.muted}>Vesialue: {sellerInfo.sellerArea || "-"}</div>
                            {sellerInfo.sellerSpot ? <div style={styles.muted}>Pyyntipaikka: {sellerInfo.sellerSpot}</div> : null}
                            <div style={styles.muted}>Toimitustapa: {sellerInfo.deliveryMethod || "-"}</div>
                            <div style={styles.muted}>Toimituskulu: {sellerInfo.deliveryCost !== "" && sellerInfo.deliveryCost != null ? `${sellerInfo.deliveryCost} €` : "-"}</div>
                            <div style={styles.muted}>Aikaisin toimitus: {sellerInfo.earliestDeliveryDate || "-"}</div>
                            <div style={styles.muted}>Kylmäkuljetus: {sellerInfo.coldTransport ? "kyllä" : "ei"}</div>
                            <div style={styles.muted}>Toimituksen tila: {fulfillmentStatusLabel(o.fulfillment_status)}</div>
                            {!["delivered", "received"].includes(String(o.fulfillment_status || "")) ? (
                              <div style={styles.noticeInfo}>
                                Muista kuitata kalaerä vastaanotetuksi heti toimituksen jälkeen. Kalastaja voi lähettää laskun vasta sen jälkeen.
                              </div>
                            ) : null}
                            <div style={styles.row}>
                              {!["delivery_agreed", "delivered", "received"].includes(String(o.fulfillment_status || "")) ? <button style={styles.button} onClick={() => updateFulfillmentStatus(o, "delivery_agreed")}>Merkitse toimitus sovituksi</button> : null}
                              {!["delivered", "received"].includes(String(o.fulfillment_status || "")) ? <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => updateFulfillmentStatus(o, "delivered")}>Kuittaa vastaanotetuksi</button> : null}
                            </div>
                          </div>
                        ) : null}
                        {!buyerOfferActionsOpen ? null : (
                        <>
                        {showCounterAction ? (
                        <>
                        {buyerTradeProfileIncomplete ? (
                          <div style={{ ...styles.noticeError, marginBottom: 12 }}>
                            Täytä ensin Omat tiedot ennen kuin voit tehdä vastatarjouksen tai varata erän. Puuttuvat tiedot: {missingBuyerTradeFields.join(", ")}.
                          </div>
                        ) : null}
                        {mixedOffer ? (
                          <>
                            <div style={styles.field}>
                              <label>Vastatarjous lajeittain</label>
                              <div style={styles.stack}>
                                {getMixedOfferCounterRows(o.species_summary).map((row) => (
                                  <div key={row.key} style={styles.field}>
                                    <label>{`${row.label} - Vastatarjous ALV 0 % (${row.unit === "kpl" ? "€/kpl" : "€/kg"})`}</label>
                                    <input
                                      style={styles.input}
                                      type="text"
                                      inputMode="decimal"
                                      value={buyerAction.mixed_counter_prices?.[row.key] || ""}
                                      onChange={(e) => updateBuyerMixedCounterNetPrice(row.key, e.target.value)}
                                      placeholder="Esim. 5,80"
                                    />
                                    <label style={{ marginTop: 8 }}>{`${row.label} - Vastatarjous sis. ALV ${formatVatPercent()} % (${row.unit === "kpl" ? "€/kpl" : "€/kg"})`}</label>
                                    <input
                                      style={styles.input}
                                      type="text"
                                      inputMode="decimal"
                                      value={
                                        buyerAction.mixed_counter_prices_gross?.[row.key] !== ""
                                          && buyerAction.mixed_counter_prices_gross?.[row.key] != null
                                          ? buyerAction.mixed_counter_prices_gross?.[row.key]
                                          : buyerAction.mixed_counter_prices?.[row.key] === ""
                                            || buyerAction.mixed_counter_prices?.[row.key] == null
                                            ? ""
                                            : (calculateGrossPrice(parseLocaleNumber(buyerAction.mixed_counter_prices?.[row.key]) || 0) ?? 0).toLocaleString("fi-FI", { maximumFractionDigits: 4 })
                                      }
                                      onChange={(e) => updateBuyerMixedCounterGrossPrice(row.key, e.target.value)}
                                      placeholder="Esim. 6,58"
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div style={styles.noticeInfo}>
                              Monilajinen erä varataan aina kokonaisuutena. Yksittäisiä kalalajeja ei voi varata erikseen tästä tarjouksesta.
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={styles.field}>
                              <label>{`Vastatarjous ALV 0 % (€/${getOfferDisplayUnit(o)})`}</label>
                              <input
                                style={styles.input}
                                type="text"
                                inputMode="decimal"
                                value={buyerAction.counter_price_per_kg}
                                onChange={(e) => updateBuyerCounterNetPrice(e.target.value)}
                                placeholder="Esim. 5,80"
                              />
                            </div>
                            <div style={styles.field}>
                              <label>{`Vastatarjous sis. ALV ${formatVatPercent()} % (€/${getOfferDisplayUnit(o)})`}</label>
                              <input
                                style={styles.input}
                                type="text"
                                inputMode="decimal"
                                value={buyerAction.counter_price_per_kg_gross_input !== ""
                                  && buyerAction.counter_price_per_kg_gross_input != null
                                  ? buyerAction.counter_price_per_kg_gross_input
                                  : buyerAction.counter_price_per_kg === "" || buyerAction.counter_price_per_kg == null
                                    ? ""
                                    : (calculateGrossPrice(parseLocaleNumber(buyerAction.counter_price_per_kg) || 0) ?? 0).toLocaleString("fi-FI", { maximumFractionDigits: 4 })}
                                onChange={(e) => updateBuyerCounterGrossPrice(e.target.value)}
                                placeholder="Esim. 6,58"
                              />
                            </div>
                          </>
                        )}
                        <div style={styles.field}>
                          <label>Viesti myyjälle</label>
                          <textarea
                            style={styles.textarea}
                            value={buyerAction.buyer_message}
                            onChange={(e) => setBuyerAction((p) => ({ ...p, buyer_message: e.target.value }))}
                            placeholder="Kirjoita viesti, joka lähetetään myyjälle vastatarjouksen mukana."
                          />
                        </div>
                        <div style={styles.row}>
                          <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => onSubmitCounter(o)}>Lähetä vastatarjous</button>
                        </div>
                        </>
                        ) : null}
                            </>
                        )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
          ) : null}
        </div>
      </div>
    );
  }

  const tabStyle = profile.role === "owner"
    ? { ...styles.tabs, gridTemplateColumns: "repeat(9, minmax(0, 1fr))" }
    : profile.role === "buyer"
    ? { ...styles.tabs6, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }
    : profile.role === "member"
    ? { ...styles.tabs6, gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }
    : styles.tabs6;
  const visibleTabStyle = isCompactTabs
    ? {
        ...tabStyle,
        display: "flex",
        flexWrap: "nowrap",
        overflowX: "auto",
        overflowY: "hidden",
        WebkitOverflowScrolling: "touch",
        padding: 8,
        gap: 8,
        borderRadius: 18,
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(12px)",
        boxShadow: "0 18px 36px rgba(15, 23, 42, 0.12)",
      }
    : tabStyle;
  const visibleSingleTabStyle = isCompactTabs
    ? {
        ...styles.tab,
        flex: "0 0 auto",
        minWidth: 124,
        whiteSpace: "nowrap",
      }
    : styles.tab;
  const grid3 = responsiveGridStyle(styles.grid3, viewportWidth);
  const grid2 = responsiveGridStyle(styles.grid2, viewportWidth);
  const formGrid = responsiveGridStyle(styles.formGrid, viewportWidth);
  const speciesRow = responsiveGridStyle(styles.speciesRow, viewportWidth);
  const fisherPremiumRequired = profile.role === "member" && !hasFisherPremium;
  const logoHeight = viewportWidth < 768
    ? 172
    : viewportWidth < 1024
    ? 206
    : 228;

  return (
    <div style={styles.app}>
      <div style={styles.container}>
        <div style={{ ...styles.card, ...styles.headerCard }}>
          <div style={styles.rowBetween}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "nowrap", marginTop: 12, marginBottom: 12 }}>
                <h1 style={{ ...styles.title, marginRight: -2 }}>Suoraan Kalastajalta</h1>
                <img
                  src="/logo.png"
                  alt=""
                  style={{
                    height: logoHeight,
                    width: "auto",
                    maxWidth: viewportWidth < 768 ? "46vw" : "none",
                    objectFit: "contain",
                    display: "block",
                    flexShrink: 0,
                  }}
                />
              </div>
              <p style={styles.subtitle}>Kirjautunut: <strong>{profile.display_name}</strong> · Rooli: <strong>{roleLabel(profile?.role)}</strong></p>
            </div>
            <div style={styles.toolbar}>
              {availableRoleOptions.length > 1 ? (
                <select
                  style={styles.input}
                  value={activeRoleOption?.id || ""}
                  onChange={(e) => {
                    const selectedRole = availableRoleOptions.find((option) => String(option.id) === String(e.target.value));
                    if (selectedRole) {
                      handleRoleSelect(selectedRole);
                    }
                  }}
                >
                  {availableRoleOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {buildRoleOptionLabel(option, buyers)}
                    </option>
                  ))}
                </select>
              ) : null}
              {profile.role === "owner" ? (
                <select style={styles.input} value={entryScope} onChange={(e) => setEntryScope(e.target.value)}>
                  <option value="own">Näytä vain omat</option>
                  <option value="all">Näytä kaikkien saaliit</option>
                </select>
              ) : null}
              <div style={viewportWidth < 560 ? {
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 8,
                width: "100%",
              } : styles.toolbarActions}>
                <button type="button" style={viewportWidth < 560 ? { ...styles.button, minWidth: 0, padding: "11px 8px", fontSize: 14 } : styles.button} onClick={handleManualRefresh}>Päivitä</button>
                <button type="button" style={viewportWidth < 560 ? { ...styles.button, minWidth: 0, padding: "11px 8px", fontSize: 14 } : styles.button} onClick={() => setAccountPanelOpen((prev) => !prev)}>{accountPanelOpen ? "Sulje tiedot" : "Omat tiedot"}</button>
                <button type="button" style={viewportWidth < 560 ? { ...styles.button, minWidth: 0, padding: "11px 8px", fontSize: 14 } : styles.button} onClick={handleLogout}>Kirjaudu ulos</button>
              </div>
            </div>
          </div>
        </div>

        {accountPanelOpen ? (
          <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack, marginBottom: 16 }}>
            <div style={styles.rowBetween}>
              <div>
                <strong>Omat tiedot</strong>
                <div style={styles.muted}>
                  {profile.role === "processor"
                    ? "Päivitä oma nimi, vesiviljelylaitoksen laitosnumero ja salasana."
                    : "Päivitä oma nimi, yrityksen tiedot ja salasana."}
                </div>
              </div>
              <span style={styles.badge}>{profile.email}</span>
            </div>
            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack, background: "#f8fafc" }}>
              <strong>Profiili</strong>
              <div style={styles.field}>
                <label>Nimi</label>
                <input style={styles.input} value={accountForm.displayName} onChange={(e) => setAccountForm((prev) => ({ ...prev, displayName: e.target.value }))} placeholder="Nimi" />
              </div>
              <div style={styles.field}>
                <label>Kirjautumissähköposti</label>
                <input style={styles.input} value={profile.email || ""} disabled />
              </div>
              {profile.role === "member" ? (
                <div style={{ ...styles.noticeInfo, ...(hasFisherPremium ? styles.noticeSuccess : styles.noticeWarning) }}>
                  <strong>{hasFisherPremium ? "Kalastajalisenssi aktiivinen." : "Kalastajalisenssi ei ole aktiivinen."}</strong>{" "}
                  {hasFisherPremium
                    ? "Voit käyttää jäljitettävyystunnuksia, etikettien tulostusta, myyntiin tarjoamista ja virallista saalisilmoitusta."
                    : "Ilmaisversiossa voit kirjata ja selata saaliita. Myyntiin tarjoaminen, jäljitettävyystunnus, etikettien tulostus ja virallinen saalisilmoitus vaativat ylläpitäjän aktivoiman kalastajalisenssin."}
                </div>
              ) : null}
              {profile.role === "buyer" ? (
                <>
                  <div style={styles.field}>
                    <label>Roolit</label>
                    <div style={{ ...styles.row, flexWrap: "wrap", gap: 12 }}>
                      {["ravintola", "tukku", "kauppa"].map((buyerTypeOption) => (
                        <label key={buyerTypeOption} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input
                            type="checkbox"
                            checked={parseBuyerTypes(accountForm.buyerType).includes(buyerTypeOption)}
                            onChange={(e) => setAccountForm((prev) => ({
                              ...prev,
                              buyerType: toggleBuyerTypeSelection(prev.buyerType, buyerTypeOption, e.target.checked),
                            }))}
                          />
                          {buyerTypeTextLabel(buyerTypeOption)}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div style={styles.field}>
                    <label>Min ostomäärä (kg)</label>
                    <input style={styles.input} type="number" value={accountForm.minKg} onChange={(e) => setAccountForm((prev) => ({ ...prev, minKg: e.target.value }))} placeholder="Esim. 10" />
                  </div>
                  <div style={styles.field}>
                    <label>Max ostomäärä (kg)</label>
                    <input style={styles.input} type="number" value={accountForm.maxKg} onChange={(e) => setAccountForm((prev) => ({ ...prev, maxKg: e.target.value }))} placeholder="Esim. 200" />
                  </div>
                  <div style={{ ...styles.noticeInfo, marginTop: -4 }}>
                    Jätä kenttä tyhjäksi tai aseta arvoksi 0, jos et halua ostomäärälle rajaa.
                  </div>
                </>
              ) : null}
              {profile.role === "processor" ? (
                <>
                  <div style={styles.field}>
                    <label>Laitosnumero</label>
                    <input style={styles.input} value={accountForm.eviraFacilityId} onChange={(e) => setAccountForm((prev) => ({ ...prev, eviraFacilityId: e.target.value }))} placeholder="Esim. F12345" />
                  </div>
                  <div style={styles.field}>
                    <label>Yrityksen nimi</label>
                    <input style={styles.input} value={accountForm.companyName} onChange={(e) => setAccountForm((prev) => ({ ...prev, companyName: e.target.value }))} placeholder="Yrityksen nimi" />
                  </div>
                  <div style={styles.field}>
                    <label>Y-tunnus</label>
                    <input style={styles.input} value={accountForm.businessId} onChange={(e) => setAccountForm((prev) => ({ ...prev, businessId: e.target.value }))} placeholder="1234567-8" />
                  </div>
                  <div style={styles.field}>
                    <label>Onko toiminta ALV-velvollista?</label>
                    <select style={styles.input} value={accountForm.vatLiable ? "yes" : "no"} onChange={(e) => setAccountForm((prev) => ({ ...prev, vatLiable: e.target.value === "yes", ...(e.target.value === "yes" ? {} : { vatNumber: "" }) }))}>
                      <option value="no">Ei</option>
                      <option value="yes">Kyllä</option>
                    </select>
                  </div>
                  {accountForm.vatLiable ? (
                    <div style={styles.field}>
                      <label>ALV-numero</label>
                      <input style={styles.input} value={accountForm.vatNumber} onChange={(e) => setAccountForm((prev) => ({ ...prev, vatNumber: e.target.value.toUpperCase() }))} placeholder="Esim. FI12345678" />
                    </div>
                  ) : null}
                  <div style={styles.field}>
                    <label>Osoite</label>
                    <input style={styles.input} value={accountForm.address} onChange={(e) => setAccountForm((prev) => ({ ...prev, address: e.target.value, ...(accountBillingSameAsDelivery ? { billingAddress: e.target.value } : {}) }))} placeholder="Katuosoite" />
                  </div>
                  <div style={styles.field}>
                    <label>Postinumero</label>
                    <input style={styles.input} value={accountForm.postcode} onChange={(e) => setAccountForm((prev) => ({ ...prev, postcode: e.target.value, ...(accountBillingSameAsDelivery ? { billingPostcode: e.target.value } : {}) }))} placeholder="00100" />
                  </div>
                  <div style={styles.field}>
                    <label>Paikkakunta</label>
                    <MunicipalitySelect value={accountForm.city} onChange={(e) => setAccountForm((prev) => ({ ...prev, city: e.target.value, ...(accountBillingSameAsDelivery ? { billingCity: e.target.value } : {}) }))} />
                  </div>
                  <div style={{ ...styles.field, ...styles.fieldFull }}>
                    <label><input type="checkbox" checked={accountBillingSameAsDelivery} onChange={(e) => {
                      const checked = e.target.checked;
                      setAccountBillingSameAsDelivery(checked);
                      if (checked) applyAccountAddressToBilling();
                    }} /> Laskutusosoite sama kuin osoite</label>
                  </div>
                  <div style={styles.field}>
                    <label>Laskutusosoite</label>
                    <input style={styles.input} value={accountForm.billingAddress} onChange={(e) => setAccountForm((prev) => ({ ...prev, billingAddress: e.target.value }))} placeholder="Katuosoite" />
                  </div>
                  <div style={styles.field}>
                    <label>Laskutus postinumero</label>
                    <input style={styles.input} value={accountForm.billingPostcode} onChange={(e) => setAccountForm((prev) => ({ ...prev, billingPostcode: e.target.value }))} placeholder="00100" />
                  </div>
                  <div style={styles.field}>
                    <label>Laskutus paikkakunta</label>
                    <MunicipalitySelect value={accountForm.billingCity} onChange={(e) => setAccountForm((prev) => ({ ...prev, billingCity: e.target.value }))} />
                  </div>
                  <div style={styles.field}>
                    <label>Laskutussähköposti</label>
                    <input style={styles.input} type="email" value={accountForm.billingEmail} onChange={(e) => setAccountForm((prev) => ({ ...prev, billingEmail: e.target.value }))} placeholder="laskutus@yritys.fi" />
                  </div>
                  <div style={styles.field}>
                    <label>Verkkolaskuosoite</label>
                    <input style={styles.input} value={accountForm.einvoiceAddress} onChange={(e) => setAccountForm((prev) => ({ ...prev, einvoiceAddress: e.target.value }))} placeholder="Verkkolaskuosoite" />
                  </div>
                  <div style={styles.field}>
                    <label>Sähköposti</label>
                    <input style={styles.input} type="email" value={accountForm.contactEmail} onChange={(e) => setAccountForm((prev) => ({ ...prev, contactEmail: e.target.value }))} placeholder="yritys@yritys.fi" />
                  </div>
                  <div style={styles.field}>
                    <label>Puhelinnumero</label>
                    <input style={styles.input} value={accountForm.phone} onChange={(e) => setAccountForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="Puhelinnumero" />
                  </div>
                  <div style={styles.field}>
                    <label>Vesityyppi etiketeille</label>
                    <select style={styles.input} value={accountForm.waterType} onChange={(e) => setAccountForm((prev) => ({ ...prev, waterType: e.target.value }))}>
                      <option value="">Valitse</option>
                      <option value={WATER_TYPE_FRESH}>Makea vesi</option>
                      <option value={WATER_TYPE_SEA}>Meri</option>
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div style={styles.field}>
                    <label>Kaupallisen kalastajan tunnus</label>
                    <input style={styles.input} value={accountForm.commercialFishingId} onChange={(e) => setAccountForm((prev) => ({ ...prev, commercialFishingId: e.target.value }))} placeholder="Esim. 12303" />
                  </div>
                  <div style={{ ...styles.field, ...styles.fieldFull }}>
                    <label>Kaupallisen kalastusaluksen tunnukset</label>
                    <textarea style={styles.textarea} value={accountForm.commercialFishingVesselIdsText} onChange={(e) => setAccountForm((prev) => ({ ...prev, commercialFishingVesselIdsText: e.target.value }))} placeholder={"Yksi tunnus per rivi\nEsim. FIN12345"} />
                  </div>
                  <div style={styles.field}>
                    <label>Yrityksen nimi</label>
                    <input style={styles.input} value={accountForm.companyName} onChange={(e) => setAccountForm((prev) => ({ ...prev, companyName: e.target.value }))} placeholder="Yrityksen nimi" />
                  </div>
                  <div style={styles.field}>
                    <label>Y-tunnus</label>
                    <input style={styles.input} value={accountForm.businessId} onChange={(e) => setAccountForm((prev) => ({ ...prev, businessId: e.target.value }))} placeholder="1234567-8" />
                  </div>
                  <div style={styles.field}>
                    <label>Onko toiminta ALV-velvollista?</label>
                    <select style={styles.input} value={accountForm.vatLiable ? "yes" : "no"} onChange={(e) => setAccountForm((prev) => ({ ...prev, vatLiable: e.target.value === "yes", ...(e.target.value === "yes" ? {} : { vatNumber: "" }) }))}>
                      <option value="no">Ei</option>
                      <option value="yes">Kyllä</option>
                    </select>
                  </div>
                  {accountForm.vatLiable ? (
                    <div style={styles.field}>
                      <label>ALV-numero</label>
                      <input style={styles.input} value={accountForm.vatNumber} onChange={(e) => setAccountForm((prev) => ({ ...prev, vatNumber: e.target.value.toUpperCase() }))} placeholder="Esim. FI12345678" />
                    </div>
                  ) : null}
                  <div style={styles.field}>
                    <label>Osoite</label>
                    <input style={styles.input} value={accountForm.address} onChange={(e) => setAccountForm((prev) => ({ ...prev, address: e.target.value, ...(accountBillingSameAsDelivery ? { billingAddress: e.target.value } : {}) }))} placeholder="Katuosoite" />
                  </div>
                  <div style={styles.field}>
                    <label>Postinumero</label>
                    <input style={styles.input} value={accountForm.postcode} onChange={(e) => setAccountForm((prev) => ({ ...prev, postcode: e.target.value, ...(accountBillingSameAsDelivery ? { billingPostcode: e.target.value } : {}) }))} placeholder="00100" />
                  </div>
                  <div style={styles.field}>
                    <label>Paikkakunta</label>
                    <MunicipalitySelect value={accountForm.city} onChange={(e) => setAccountForm((prev) => ({ ...prev, city: e.target.value, ...(accountBillingSameAsDelivery ? { billingCity: e.target.value } : {}) }))} />
                  </div>
                  <div style={{ ...styles.field, ...styles.fieldFull }}>
                    <label><input type="checkbox" checked={accountBillingSameAsDelivery} onChange={(e) => {
                      const checked = e.target.checked;
                      setAccountBillingSameAsDelivery(checked);
                      if (checked) applyAccountAddressToBilling();
                    }} /> Laskutusosoite sama kuin osoite</label>
                  </div>
                  <div style={styles.field}>
                    <label>Laskutusosoite</label>
                    <input style={styles.input} value={accountForm.billingAddress} onChange={(e) => setAccountForm((prev) => ({ ...prev, billingAddress: e.target.value }))} placeholder="Katuosoite" />
                  </div>
                  <div style={styles.field}>
                    <label>Laskutus postinumero</label>
                    <input style={styles.input} value={accountForm.billingPostcode} onChange={(e) => setAccountForm((prev) => ({ ...prev, billingPostcode: e.target.value }))} placeholder="00100" />
                  </div>
                  <div style={styles.field}>
                    <label>Laskutus paikkakunta</label>
                    <MunicipalitySelect value={accountForm.billingCity} onChange={(e) => setAccountForm((prev) => ({ ...prev, billingCity: e.target.value }))} />
                  </div>
                  <div style={styles.field}>
                    <label>Laskutussähköposti</label>
                    <input style={styles.input} type="email" value={accountForm.billingEmail} onChange={(e) => setAccountForm((prev) => ({ ...prev, billingEmail: e.target.value }))} placeholder="laskutus@yritys.fi" />
                  </div>
                  <div style={styles.field}>
                    <label>Verkkolaskuosoite</label>
                    <input style={styles.input} value={accountForm.einvoiceAddress} onChange={(e) => setAccountForm((prev) => ({ ...prev, einvoiceAddress: e.target.value }))} placeholder="Verkkolaskuosoite" />
                  </div>
                  <div style={styles.field}>
                    <label>Sähköposti</label>
                    <input style={styles.input} type="email" value={accountForm.contactEmail} onChange={(e) => setAccountForm((prev) => ({ ...prev, contactEmail: e.target.value }))} placeholder="yritys@yritys.fi" />
                  </div>
                  <div style={styles.field}>
                    <label>Puhelinnumero</label>
                    <input style={styles.input} value={accountForm.phone} onChange={(e) => setAccountForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="Puhelinnumero" />
                  </div>
                  <div style={styles.field}>
                    <label>Vesityyppi etiketeille</label>
                    <select style={styles.input} value={accountForm.waterType} onChange={(e) => setAccountForm((prev) => ({ ...prev, waterType: e.target.value }))}>
                      <option value="">Valitse</option>
                      <option value={WATER_TYPE_FRESH}>Makea vesi</option>
                      <option value={WATER_TYPE_SEA}>Meri</option>
                    </select>
                  </div>
                </>
              )}
              <div style={{ ...styles.row, justifyContent: "flex-end" }}>
                <button style={{ ...styles.button, ...styles.primaryButton }} onClick={handleSaveOwnDetails} disabled={accountSaving}>{accountSaving ? "Tallennetaan..." : "Tallenna tiedot"}</button>
              </div>
            </div>
            {profile.role !== "owner" && !hasBuyerRoleOption ? (
              <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack, background: "#f8fafc" }}>
                <strong>Pyydä lisäroolia</strong>
                <div style={styles.muted}>Voit pyytää samalla sähköpostilla myös ostajaroolia. Ostajarooli avautuu heti, jos sähköposti on linkitetty ostajayritykseen.</div>
                <div style={{ ...styles.row, justifyContent: "flex-end" }}>
                  {!hasBuyerRoleOption ? (
                    <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => handleRequestAdditionalRole("buyer")}>
                      Pyydä ostajaroolia
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack, background: "#f8fafc" }}>
              <strong>Vaihda salasana</strong>
              <div style={styles.field}>
                <label>Uusi salasana</label>
                <input style={styles.input} type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))} placeholder="Vähintään 8 merkkiä" />
              </div>
              <div style={styles.field}>
                <label>Uusi salasana uudelleen</label>
                <input style={styles.input} type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))} placeholder="Kirjoita salasana uudelleen" />
              </div>
              <div style={styles.muted}>Salasanan vaihto tehdään heti nykyiselle käyttäjätilille.</div>
              <div style={{ ...styles.row, justifyContent: "flex-end" }}>
                <button style={{ ...styles.button, ...styles.primaryButton }} onClick={handleChangePassword} disabled={passwordSaving}>{passwordSaving ? "Vaihdetaan..." : "Vaihda salasana"}</button>
              </div>
            </div>
          </div>
        ) : null}

        {(authError || authInfo || authWarning) ? (
          <div style={styles.toastStack}>
            {authError ? (
              <div style={{ ...styles.noticeError, ...styles.toastCard }}>
                {authError}
                <button type="button" style={styles.toastClose} onClick={() => setAuthError("")} aria-label="Sulje virheilmoitus">×</button>
              </div>
            ) : null}
            {authWarning ? (
              <div style={{ ...styles.noticeWarning, ...styles.toastCard }}>
                {authWarning}
                <button type="button" style={styles.toastClose} onClick={() => setAuthWarning("")} aria-label="Sulje huomio">×</button>
              </div>
            ) : null}
            {authInfo ? (
              <div style={{ ...styles.noticeSuccess, ...styles.toastCard }}>
                {authInfo}
                <button type="button" style={styles.toastClose} onClick={() => setAuthInfo("")} aria-label="Sulje ilmoitus">×</button>
              </div>
            ) : null}
          </div>
        ) : null}
        <FirstUseGuideCard
          profile={profile}
          guideState={onboardingGuideState}
          onDismissNow={dismissOnboardingGuideNow}
          onHideForever={hideOnboardingGuideForever}
          viewportWidth={viewportWidth}
        />

        <div style={{ ...styles.stickyTabsWrap, position: "sticky" }}>
          <div style={{ position: "relative" }}>
            <div ref={tabsScrollRef} style={visibleTabStyle}>
              <button style={{ ...visibleSingleTabStyle, ...(activeTab === "dashboard" ? styles.activeTab : {}) }} onClick={() => setActiveTab("dashboard")}>Yhteenveto</button>
              {profile.role !== "buyer" ? <button style={{ ...visibleSingleTabStyle, ...(activeTab === "add" ? styles.activeTab : {}) }} onClick={() => setActiveTab("add")}>{profile.role === "processor" ? "Lisää jaloste-erä" : "Lisää saalis"}</button> : null}
              {profile.role !== "buyer" ? <button style={{ ...visibleSingleTabStyle, ...(activeTab === "entries" ? styles.activeTab : {}) }} onClick={() => setActiveTab("entries")}>{profile.role === "processor" ? "Jaloste-erät" : "Saaliit"}</button> : null}
              <button style={{ ...visibleSingleTabStyle, ...(activeTab === "offers" ? styles.activeTab : {}) }} onClick={() => setActiveTab("offers")}>Tarjoukset</button>
              <button style={{ ...visibleSingleTabStyle, ...(activeTab === "reports" ? styles.activeTab : {}) }} onClick={() => setActiveTab("reports")}>Raportit</button>
              {profile.role === "member" ? <button style={{ ...visibleSingleTabStyle, ...(activeTab === "billing" ? styles.activeTab : {}) }} onClick={() => { setActiveTab("billing"); setRefreshTick((prev) => prev + 1); }}>Laskutus</button> : null}
              {profile.role === "owner" ? <button style={{ ...visibleSingleTabStyle, ...(activeTab === "operations" ? styles.activeTab : {}) }} onClick={() => setActiveTab("operations")}>Ylläpito</button> : null}
              {profile.role === "owner" ? <button style={{ ...visibleSingleTabStyle, ...(activeTab === "buyers" ? styles.activeTab : {}) }} onClick={() => setActiveTab("buyers")}>Ostajat</button> : null}
              {profile.role === "owner" ? <button style={{ ...visibleSingleTabStyle, ...(activeTab === "users" ? styles.activeTab : {}) }} onClick={() => setActiveTab("users")}>Käyttäjät</button> : null}
              {profile.role === "owner" ? <button style={{ ...visibleSingleTabStyle, ...(activeTab === "billing" ? styles.activeTab : {}) }} onClick={() => { setActiveTab("billing"); setRefreshTick((prev) => prev + 1); }}>Laskutus</button> : null}
            </div>
            {tabsOverflowing ? (
              <div
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: showTabsScrollHint ? 108 : 40,
                  height: 58,
                  borderRadius: 20,
                  background: showTabsScrollHint
                    ? "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.84) 42%, rgba(255,255,255,0.98) 100%)"
                    : "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.96) 82%)",
                  pointerEvents: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  paddingRight: 8,
                  boxSizing: "border-box",
                }}
              >
                {showTabsScrollHint ? (
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 10px",
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.98)",
                      border: "1px solid rgba(147, 197, 253, 0.8)",
                      color: "#1e3a8a",
                      fontSize: 12,
                      fontWeight: 800,
                      boxShadow: "0 8px 20px rgba(37, 99, 235, 0.08)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span>Lisää</span>
                    <span>→</span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {activeTab === "dashboard" ? (
          <div style={styles.stack}>
            <div style={grid3}>
              <div style={{ ...styles.card, ...styles.sectionCard }}><div style={styles.metric}>{profile.role === "processor" ? totals.totalProcessedKg.toFixed(1) : totals.totalKg.toFixed(1)} kg</div><div style={styles.muted}>{profile.role === "processor" ? "Jalosteita yhteensä" : "Kokonaissaalis"}</div></div>
              <div style={{ ...styles.card, ...styles.sectionCard }}><div style={styles.metric}>{profile.role === "processor" ? totals.processedForSaleKg.toFixed(1) : totals.forSaleKg.toFixed(1)} kg</div><div style={styles.muted}>Tarjolla ostajille</div></div>
              <div style={{ ...styles.card, ...styles.sectionCard }}><div style={styles.metric}>{profile.role === "processor" ? processedEntries.length : entries.length}</div><div style={styles.muted}>{profile.role === "processor" ? "Tallennettuja jaloste-eriä" : "Tallennettuja eriä"}</div></div>
            </div>
            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
              <strong>{profile.role === "processor" ? "Tuotetyyppien yhteenveto" : "Lajikohtainen yhteenveto"}</strong>
              {profile.role === "processor"
                ? (totals.processedSummary.length === 0
                  ? <div style={styles.muted}>Ei vielä jaloste-eriä.</div>
                  : totals.processedSummary.map((item) => (
                    <div key={item.productType} style={{ ...styles.stack, gap: 6 }}>
                      <div style={styles.rowBetween}><span>{item.productType}</span><span>{item.kilos.toFixed(1)} kg</span></div>
                      <div style={styles.progress}><span style={{ ...styles.progressFill, width: `${Math.max((item.kilos / Math.max(totals.totalProcessedKg, 1)) * 100, 4)}%` }} /></div>
                    </div>
                  )))
                : (totals.speciesSummary.length === 0
                  ? <div style={styles.muted}>Ei vielä saalistietoja.</div>
                  : totals.speciesSummary.map((item) => (
                    <div key={item.species} style={{ ...styles.stack, gap: 6 }}>
                      <div style={styles.rowBetween}><span>{item.species}</span><span>{item.kilos.toFixed(1)} kg</span></div>
                      <div style={styles.progress}><span style={{ ...styles.progressFill, width: `${Math.max((item.kilos / Math.max(totals.totalKg, 1)) * 100, 4)}%` }} /></div>
                    </div>
                  )))}
            </div>
          </div>
        ) : null}

        {activeTab === "add" ? (
          profile.role === "processor" ? (
            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
              <div style={{ ...styles.field, ...styles.fieldFull, ...styles.stack }}>
                <label>Omat tuotteet</label>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                  <select
                    style={{ ...styles.input, flex: "1 1 320px" }}
                    value={selectedProcessedProductId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setSelectedProcessedProductId(nextId);
                      if (!nextId) return;
                      const selectedProduct = processedProducts.find((item) => item.id === nextId);
                      if (!selectedProduct) return;
                      setProcessedAreaSelector(resolveAreaSelectorValue(selectedProduct.area || "Saimaa", savedCustomLakeAreas, savedCustomSeaAreas));
                      setProcessedForm((prev) => ({
                        ...prev,
                        area: selectedProduct.area || "Saimaa",
                        municipality: selectedProduct.municipality || "",
                        originCity: selectedProduct.originCity || selectedProduct.municipality || "",
                        spot: selectedProduct.spot || "",
                        productName: selectedProduct.productName || "",
                        productType: selectedProduct.productType || "Filee",
                        processingMethod: selectedProduct.processingMethod || "Fileointi",
                        productState: selectedProduct.productState || "",
                        speciesNameFi: selectedProduct.speciesNameFi || "",
                        speciesNameScientific: selectedProduct.speciesNameScientific || "",
                        gearType: selectedProduct.gearType || "",
                        speciesSummary: selectedProduct.speciesSummary || "",
                        ingredients: selectedProduct.ingredients || "",
                        allergens: selectedProduct.allergens || "",
                        storageTemperature: selectedProduct.storageTemperature || "",
                        storageInstructions: selectedProduct.storageInstructions || "",
                        packageSizeG: selectedProduct.packageSizeG === "" ? "" : selectedProduct.packageSizeG,
                        notes: selectedProduct.notes || "",
                      }));
                      setProcessedRecipeRows(
                        Array.isArray(selectedProduct.recipeItems) && selectedProduct.recipeItems.length > 0
                          ? selectedProduct.recipeItems.map((item) => createProcessedRecipeRow(item))
                          : [createProcessedRecipeRow()],
                      );
                    }}
                  >
                    <option value="">Valitse tallennettu tuote</option>
                    {processedProducts.map((item) => (
                      <option key={item.id} value={item.id}>{item.templateName}</option>
                    ))}
                  </select>
                  {selectedProcessedProductId ? (
                    <button
                      type="button"
                      style={styles.button}
                      onClick={() => {
                        setSelectedProcessedProductId("");
                        setSaveProcessedAsProduct(false);
                        setProcessedAreaSelector(resolveAreaSelectorValue("Saimaa", savedCustomLakeAreas, savedCustomSeaAreas));
                        setProcessedForm(createInitialProcessedForm());
                        setProcessedRecipeRows([createProcessedRecipeRow()]);
                      }}
                    >
                      Tyhjennä valinta
                    </button>
                  ) : null}
                </div>
                <div style={styles.small}>Valitse aiemmin tallennettu tuote ja muokkaa sen tietoja tarvittaessa ennen erän tallennusta.</div>
              </div>
              <div style={formGrid}>
                <div style={styles.field}><label>Tuotantopäivä</label><input style={styles.input} type="date" value={processedForm.productionDate} onChange={(e) => setProcessedForm({ ...processedForm, productionDate: e.target.value })} /></div>
                <div style={styles.field}><label>Parasta ennen</label><input style={styles.input} type="date" value={processedForm.bestBeforeDate} onChange={(e) => setProcessedForm({ ...processedForm, bestBeforeDate: e.target.value })} /></div>
                <div style={styles.field}><label>Viimeinen käyttöpäivä</label><input style={styles.input} type="date" value={processedForm.useByDate} onChange={(e) => setProcessedForm({ ...processedForm, useByDate: e.target.value })} /></div>
                <div style={styles.field}>
                  <label>Vesialue / alkuperä</label>
                  <select
                    style={styles.input}
                    value={processedAreaSelector}
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      setProcessedAreaSelector(nextValue);
                      if (nextValue !== CUSTOM_LAKE_AREA_OPTION && nextValue !== CUSTOM_SEA_AREA_OPTION) {
                        setProcessedForm({ ...processedForm, area: nextValue });
                      }
                    }}
                  >
                    {defaultAreas.map((area) => <option key={area} value={area}>{area}</option>)}
                    {savedCustomLakeAreas.length > 0 ? <option disabled value="__custom_lake_separator__">-- Omat järvialueet --</option> : null}
                    {savedCustomLakeAreas.map((area) => <option key={`lake-${area}`} value={area}>{area}</option>)}
                    {savedCustomSeaAreas.length > 0 ? <option disabled value="__custom_sea_separator__">-- Omat merialueet --</option> : null}
                    {savedCustomSeaAreas.map((area) => <option key={`sea-${area}`} value={area}>{area}</option>)}
                    <option value={CUSTOM_LAKE_AREA_OPTION}>Muu järvi</option>
                    <option value={CUSTOM_SEA_AREA_OPTION}>Merialue (muu)</option>
                  </select>
                </div>
                {processedAreaSelector === CUSTOM_LAKE_AREA_OPTION || processedAreaSelector === CUSTOM_SEA_AREA_OPTION ? (
                  <div style={styles.field}>
                    <label>{processedAreaSelector === CUSTOM_SEA_AREA_OPTION ? "Kirjoita merialue" : "Kirjoita järven nimi"}</label>
                    <input
                      style={styles.input}
                      value={processedForm.area}
                      onChange={(e) => setProcessedForm({ ...processedForm, area: e.target.value })}
                      placeholder={processedAreaSelector === CUSTOM_SEA_AREA_OPTION ? "Esim. Merenkurkku" : "Esim. Puumalan Lietvesi"}
                    />
                  </div>
                ) : null}
                <div style={styles.field}><label>Paikkakunta</label><MunicipalitySelect value={processedForm.municipality} onChange={(e) => setProcessedForm({ ...processedForm, municipality: e.target.value })} /></div>
                <div style={styles.field}><label>Tuotenimi</label><input style={styles.input} value={processedForm.productName} onChange={(e) => setProcessedForm({ ...processedForm, productName: e.target.value })} placeholder="Esim. Kylmäsavulohi viipale" /></div>
                <div style={styles.field}><label>Tuotetyyppi</label><select style={styles.input} value={processedForm.productType} onChange={(e) => setProcessedForm({ ...processedForm, productType: e.target.value })}>{processedProductTypes.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
                <div style={styles.field}>
                  <label>Säilytys</label>
                  <select style={styles.input} value={processedForm.storageTemperature} onChange={(e) => setProcessedForm({ ...processedForm, storageTemperature: e.target.value })}>
                    <option value="">Valitse</option>
                    <option value="0-2 °C">0-2 °C</option>
                    <option value="-18 °C">-18 °C</option>
                  </select>
                </div>
                <div style={styles.field}>
                  <label>Tuotteen tila</label>
                  <select style={styles.input} value={processedForm.productState} onChange={(e) => setProcessedForm({ ...processedForm, productState: e.target.value })}>
                    <option value="">Valitse tarvittaessa</option>
                    <option value="Tuore">Tuore</option>
                    <option value="Kypsennetty">Kypsennetty</option>
                    <option value="Kypsennetty, pakastettu">Kypsennetty, pakastettu</option>
                    <option value="Pakastettu">Pakastettu</option>
                    <option value="Sulatettu">Sulatettu</option>
                  </select>
                </div>
                <div style={styles.field}><label>Käsittelypaikka</label><input style={styles.input} value={processedForm.spot} onChange={(e) => setProcessedForm({ ...processedForm, spot: e.target.value })} placeholder="Esim. Kalalaitos Oy" /></div>
                <div style={{ ...styles.field, ...styles.fieldFull, ...styles.stack }}>
                  <label>{profile.role === "processor" ? "Liitä omat ostetut YKP-raaka-aine-erät" : "Liitä kalastajan YKP-raaka-aine-erät"}</label>
                  {availableSourceEntries.length === 0 ? (
                    <div style={styles.noticeInfo}>{profile.role === "processor" ? "Ei vielä omia hyväksytysti ostettuja YKP-raaka-aine-eriä linkitettäväksi." : "Ei vielä batch-tunnuksella tallennettuja saaliseriä linkitettäväksi."}</div>
                  ) : (
                    <div style={{ ...styles.stack, gap: 10 }}>
                      {availableSourceEntries.map((entry) => {
                        const checked = processedForm.sourceEntryIds.includes(entry.id);
                        return (
                          <label key={entry.id} style={{ ...styles.checkboxCard, justifyContent: "space-between", width: "100%", borderRadius: 18 }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  setProcessedForm((prev) => ({
                                    ...prev,
                                    sourceEntryIds: e.target.checked
                                      ? [...prev.sourceEntryIds, entry.id]
                                      : prev.sourceEntryIds.filter((id) => id !== entry.id),
                                  }));
                                }}
                              />
                              <span>{formatSourceBatchSummary(entry)}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {selectedProcessedSourceEntries.length > 0 ? (
                    <div style={{ ...styles.stack, gap: 8 }}>
                      <div style={styles.small}>Valitut lähde-erät kulkevat jaloste-erän mukana jäljitettävyysketjussa.</div>
                      {selectedProcessedSourceEntries.map((entry) => (
                        <div key={entry.id} style={{ ...styles.entry, background: "#f8fbff" }}>
                          <div style={styles.rowBetween}>
                            <div style={{ ...styles.stack, gap: 6 }}>
                              <div><strong>{formatSpeciesForSale(entry.species)}</strong></div>
                              <div style={styles.muted}>{entry.kilos} kg · {entry.date} · {entry.batchId}</div>
                            </div>
                            <div style={styles.qrBlock}>
                              <img src={getBatchQrImageUrl(entry.batchId)} alt={`QR ${entry.batchId}`} style={styles.qrImage} />
                              <div style={styles.small}>Lähde-erän QR</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div style={{ ...styles.field, ...styles.fieldFull }}><label>Raaka-aine / lajiyhteenveto</label><textarea style={styles.textarea} value={processedForm.speciesSummary} onChange={(e) => setProcessedForm({ ...processedForm, speciesSummary: e.target.value })} placeholder="Esim. lohi fileenä, kuha fileenä, muikkumassa" /></div>
                <div style={{ ...styles.field, ...styles.fieldFull }}><label>Ainesosat</label><textarea style={styles.textarea} value={processedForm.ingredients} onChange={(e) => setProcessedForm({ ...processedForm, ingredients: e.target.value })} placeholder="Esim. Muikku (kala), suola" /></div>
                <div style={{ ...styles.field, ...styles.fieldFull }}><label>Allergeenit</label><textarea style={styles.textarea} value={processedForm.allergens} onChange={(e) => setProcessedForm({ ...processedForm, allergens: e.target.value })} placeholder="Esim. Kala" /></div>
                <div style={{ ...styles.field, ...styles.fieldFull }}><label>Säilytysohje</label><textarea style={styles.textarea} value={processedForm.storageInstructions} onChange={(e) => setProcessedForm({ ...processedForm, storageInstructions: e.target.value })} placeholder="Esim. Säilytys 0–3 °C" /></div>
                <div style={{ ...styles.field, ...styles.fieldFull, ...styles.stack }}>
                  <label>Ravintoarvojen resepti (Fineli, %)</label>
                  <div style={styles.noticeInfo}>Valitse jokaiselle ainesosalle Fineli-osuma itse. Ravintoarvot lasketaan automaattisesti per 100 g vain jalostepuolen etikettiä varten.</div>
                  <div style={styles.small}>Vakioaineet toimivat myös ilman Fineliä: suola, vesi ja sokeri.</div>
                  <div style={{ display: "grid", gap: 12 }}>
                    {processedRecipeRows.map((row, index) => (
                      <div key={row.id} style={{ ...styles.entry, background: "#f8fbff", padding: 14, gap: 12 }}>
                        <div style={{ ...styles.rowBetween, gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                          <strong>Ainesosa {index + 1}</strong>
                          <button type="button" style={styles.button} onClick={() => removeProcessedRecipeRow(row.id)}>
                            {processedRecipeRows.length > 1 ? "Poista" : "Tyhjennä"}
                          </button>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) 140px auto", gap: 12 }}>
                          <div style={styles.field}>
                            <label>Ainesosan nimi</label>
                            <input
                              style={styles.input}
                              value={row.ingredientName}
                              onChange={(e) => updateProcessedRecipeRow(row.id, {
                                ingredientName: e.target.value,
                                fineliFoodId: "",
                                fineliFoodName: "",
                                fineliNutrients: null,
                                searchResults: [],
                                searchError: "",
                              })}
                              placeholder="Esim. Hauki"
                            />
                          </div>
                          <div style={styles.field}>
                            <label>Osuus %</label>
                            <input
                              style={styles.input}
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.1"
                              value={row.percentage}
                              onChange={(e) => updateProcessedRecipeRow(row.id, { percentage: e.target.value })}
                              placeholder="Esim. 60"
                            />
                          </div>
                          <div style={{ ...styles.field, alignSelf: "end" }}>
                            <button
                              type="button"
                              style={{ ...styles.button, width: "100%" }}
                              onClick={() => handleSearchProcessedRecipeRow(row.id)}
                              disabled={row.searchLoading}
                            >
                              {row.searchLoading ? "Haetaan..." : "Hae Fineli"}
                            </button>
                          </div>
                        </div>
                        <div style={styles.field}>
                          <label>Valitse Fineli-tuote</label>
                          <select
                            style={styles.input}
                            value={row.fineliFoodId}
                            onChange={(e) => handleSelectProcessedRecipeFood(row.id, e.target.value)}
                          >
                            <option value="">{row.searchResults.length > 0 ? "Valitse haun tuloksista" : "Hae ensin Finelistä"}</option>
                            {row.searchResults.map((item) => (
                              <option key={item.id} value={item.id}>{item.name}</option>
                            ))}
                          </select>
                        </div>
                        {row.fineliFoodName ? (
                          <div style={styles.small}>Valittu Fineli-tuote: <strong>{row.fineliFoodName}</strong></div>
                        ) : null}
                        <label style={{ ...styles.checkboxCard, background: "#fff" }}>
                          <input
                            type="checkbox"
                            checked={row.nutritionMode === "manual"}
                            onChange={(e) => updateProcessedRecipeRow(row.id, {
                              nutritionMode: e.target.checked ? "manual" : "fineli",
                            })}
                          />
                          Syötä ravintoarvot käsin tälle ainesosalle
                        </label>
                        {row.nutritionMode === "manual" ? (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
                            {PROCESSED_NUTRITION_FIELDS.map((field) => (
                              <div key={`${row.id}-${field.key}`} style={styles.field}>
                                <label>{field.label} {field.unit}</label>
                                <input
                                  style={styles.input}
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  step="0.1"
                                  value={row.manualNutrition?.[field.key] ?? ""}
                                  onChange={(e) => updateProcessedRecipeManualNutrition(row.id, field.key, e.target.value)}
                                  placeholder="0"
                                />
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {row.searchError ? <div style={styles.noticeError}>{row.searchError}</div> : null}
                      </div>
                    ))}
                  </div>
                  <div style={styles.row}>
                    <button type="button" style={styles.button} onClick={addProcessedRecipeRow}>Lisää ainesosa</button>
                  </div>
                  <div style={{ ...styles.entry, background: "#fff", gap: 12 }}>
                    <strong>Ravintoarvot per 100 g</strong>
                    {processedNutritionRows.length > 0 ? (
                      <div style={{ display: "grid", gridTemplateColumns: "minmax(200px, 1fr) auto", gap: 8 }}>
                        {processedNutritionRows.map((row) => (
                          <React.Fragment key={row.key}>
                            <div>{row.label}</div>
                            <div><strong>{row.value} {row.unit}</strong></div>
                          </React.Fragment>
                        ))}
                      </div>
                    ) : (
                      <div style={styles.small}>Ravintoarvot muodostuvat tähän, kun kaikille reseptin riveille on valittu Fineli-tuote tai syötetty ravintoarvot käsin sekä prosentit.</div>
                    )}
                    {processedNutritionPreview.hasRows && !processedNutritionPreview.complete ? (
                      <div style={styles.noticeInfo}>Valitse kaikille reseptin riveille Fineli-osuma tai syötä rivin ravintoarvot käsin sekä prosenttiosuus, jotta ravintoarvot saadaan laskettua.</div>
                    ) : null}
                    {processedNutritionPreview.totalPercentage > 0 && Math.abs(processedNutritionPreview.totalPercentage - 100) > 0.2 ? (
                      <div style={styles.noticeInfo}>Prosenttien summa on nyt {processedNutritionPreview.totalPercentage.toLocaleString("fi-FI", { maximumFractionDigits: 1 })} %. Laskenta normalisoidaan automaattisesti per 100 g, mutta tarkin tulos saadaan kun summa on 100 %.</div>
                    ) : null}
                  </div>
                </div>
                <div style={styles.field}><label>Määrä kg</label><input style={styles.input} type="number" value={processedForm.kilos} onChange={(e) => setProcessedForm({ ...processedForm, kilos: e.target.value })} placeholder="0" /></div>
                <div style={styles.field}><label>Pakkauskoko g</label><input style={styles.input} type="number" value={processedForm.packageSizeG} onChange={(e) => setProcessedForm({ ...processedForm, packageSizeG: e.target.value })} placeholder="Esim. 500" /></div>
                <div style={styles.field}><label>Pakkausten määrä</label><input style={styles.input} type="number" value={processedForm.packageCount} onChange={(e) => setProcessedForm({ ...processedForm, packageCount: e.target.value })} placeholder="Esim. 40" /></div>
                <div style={{ ...styles.field, ...styles.fieldFull }}>
                  <label style={styles.checkboxCard}>
                    <input
                      type="checkbox"
                      checked={processedForm.listForSale}
                      onChange={(e) => setProcessedForm((prev) => ({
                        ...prev,
                        listForSale: e.target.checked,
                        ...(e.target.checked ? {} : {
                          offerToShops: false,
                          offerToRestaurants: false,
                          offerToWholesalers: false,
                          deliveryPossible: false,
                        }),
                      }))}
                    />
                    Laita jaloste-erä myyntiin
                  </label>
                </div>
                {processedForm.listForSale ? (
                  <>
                <div style={styles.field}><label>Aikaisin toimitus</label><input style={styles.input} type="date" value={processedForm.earliestDeliveryDate} onChange={(e) => setProcessedForm({ ...processedForm, earliestDeliveryDate: e.target.value })} /></div>
                <div style={styles.field}><label><input type="checkbox" checked={processedForm.coldTransport} onChange={(e) => setProcessedForm({ ...processedForm, coldTransport: e.target.checked })} /> Kylmäkuljetus</label></div>
                <div style={{ ...styles.field, ...styles.fieldFull }}>
                  <div style={{ ...styles.offerBox, ...styles.stack, ...(!DELIVERY_COMPETITION_AVAILABLE ? styles.disabledSection : null) }}>
                    <label><input type="checkbox" checked={DELIVERY_COMPETITION_AVAILABLE && processedForm.deliveryPossible} disabled /> Kilpailuta kuljetus</label>
                    <div style={styles.small}>Saatavilla myöhemmin. Tässä kohtaa voi jatkossa valita kuljetustavan, nouto-osoitteen tai lähimmän terminaalin ja toimituskohteet.</div>
                    {DELIVERY_COMPETITION_AVAILABLE && processedForm.deliveryPossible ? (
                      <>
                        <div style={styles.field}>
                          <label>Lähtösijainti</label>
                          <MunicipalitySelect value={currentProcessedOriginCity} onChange={(e) => setProcessedForm({ ...processedForm, originCity: e.target.value, originPointId: "" })} />
                        </div>
                        <div style={{ ...styles.field, ...styles.stack }}>
                          <label>Valitse kuljetustapa</label>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                            {[
                              { value: "pickup", title: "Kuljetusfirma noutaa", detail: "Täytät kalaerän nouto-osoitteen ja kuljetus noudetaan siitä." },
                              { value: "terminal", title: "Toimita terminaaliin", detail: "Appi näyttää lähimmät terminaalit valitun lähtösijainnin perusteella." },
                              { value: "collection_point", title: "Toimita keräilypisteeseen", detail: "Appi näyttää lähimmät keräilypisteet valitun lähtösijainnin perusteella." },
                            ].map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                style={{
                                  ...styles.button,
                                  textAlign: "left",
                                  justifyContent: "flex-start",
                                  padding: 16,
                                  minHeight: 110,
                                  background: processedForm.transportMode === option.value ? "linear-gradient(135deg, #2563eb, #0ea5e9)" : "#f8fbff",
                                  color: processedForm.transportMode === option.value ? "#fff" : "#0f172a",
                                  borderColor: processedForm.transportMode === option.value ? "#2563eb" : "#bfdbfe",
                                }}
                                onClick={() => setProcessedForm((prev) => ({
                                  ...prev,
                                  deliveryMethod: "Kuljetus järjestetään",
                                  transportMode: option.value,
                                  originPointId: option.value === "pickup" ? "" : prev.originPointId,
                                  pickupAddress: option.value === "pickup" ? (prev.pickupAddress || savedPickupAddress) : prev.pickupAddress,
                                  pickupSurcharge: option.value === "pickup" ? "12" : "",
                                  estimatedPickupTime: option.value === "pickup" ? "Arkipäivisin klo 12–16" : "",
                                }))}
                              >
                                <span style={{ ...styles.stack, gap: 6 }}>
                                  <strong>{option.title}</strong>
                                  <span style={{ fontSize: 14, opacity: processedForm.transportMode === option.value ? 0.95 : 0.75 }}>{option.detail}</span>
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
                {DELIVERY_COMPETITION_AVAILABLE && processedForm.deliveryPossible ? (
                  <>
                    {processedForm.transportMode === "terminal" || processedForm.transportMode === "collection_point" ? (
                      <div style={{ ...styles.field, ...styles.fieldFull, ...styles.stack }}>
                        <label>{processedForm.transportMode === "terminal" ? "Appin näyttämät lähimmät terminaalit" : "Appin näyttämät lähimmät keräilypisteet"}</label>
                        {availableProcessedOriginPoints.length === 0 ? (
                          <div style={styles.noticeInfo}>Tälle alueelle ei löytynyt sopivaa luovutuspistettä. Vaihda lähtöpaikkaa tai kuljetustapaa.</div>
                        ) : (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
                            {availableProcessedOriginPoints.map((point) => (
                              <button
                                key={point.id}
                                type="button"
                                style={{
                                  ...styles.button,
                                  textAlign: "left",
                                  justifyContent: "flex-start",
                                  padding: 16,
                                  minHeight: 120,
                                  background: processedForm.originPointId === point.id ? "#eff6ff" : "#fff",
                                  borderColor: processedForm.originPointId === point.id ? "#2563eb" : "#cbd5e1",
                                }}
                                onClick={() => setProcessedForm((prev) => ({ ...prev, originPointId: point.id }))}
                              >
                                <span style={{ ...styles.stack, gap: 6 }}>
                                  <strong>{point.name}</strong>
                                  <span style={styles.muted}>{point.address}</span>
                                  <span style={styles.small}>Viimeinen jättöaika: {point.latest_dropoff_time || "-"}</span>
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}
                    {processedForm.transportMode === "pickup" ? (
                      <div style={{ ...styles.field, ...styles.fieldFull, ...styles.stack }}>
                        <label>Täytä kalaerän nouto-osoite</label>
                        <div style={styles.field}>
                          <label>Nouto-osoite</label>
                          <input
                            style={styles.input}
                            value={processedForm.pickupAddress || savedPickupAddress}
                            onChange={(e) => setProcessedForm((prev) => ({ ...prev, pickupAddress: e.target.value }))}
                            placeholder="Kirjoita nouto-osoite, jos sitä ei ole tallennettu omiin tietoihin"
                          />
                        </div>
                        <div style={styles.noticeInfo}>
                          Noutopaikka: {[resolvedProcessedPickupAddress, currentProcessedOriginCity, processedForm.spot].filter(Boolean).join(", ") || "-"}<br />
                          Noutolisä: {processedForm.pickupSurcharge !== "" ? `${processedForm.pickupSurcharge} €` : "-"}<br />
                          Arvioitu noutoaika: {processedForm.estimatedPickupTime || "-"}
                        </div>
                      </div>
                    ) : null}
                    <div style={{ ...styles.field, ...styles.fieldFull, ...styles.stack }}>
                      <div style={styles.rowBetween}>
                        <label>Ehdotetut toimituskohteet lähtösijainnin perusteella</label>
                        <div style={styles.row}>
                          <button
                            type="button"
                            style={styles.button}
                            onClick={() => setProcessedForm((prev) => ({ ...prev, deliveryDestinations: suggestedProcessedDeliveryCities.filter((city) => !prev.originPointId || getRoutePrice(prev.originPointId, city, totalProcessedKilosForOffer)).slice(0, 10) }))}
                          >
                            Ehdota kohteet
                          </button>
                          <button
                            type="button"
                            style={styles.button}
                            onClick={() => setProcessedForm((prev) => ({
                              ...prev,
                              deliveryDestinations: availableProcessedDestinationCities.filter((city) => !prev.originPointId || getRoutePrice(prev.originPointId, city, totalProcessedKilosForOffer)),
                            }))}
                          >
                            Valitse kaikki hinnastolliset
                          </button>
                          <button
                            type="button"
                            style={styles.button}
                            onClick={() => setProcessedForm((prev) => ({ ...prev, deliveryDestinations: [] }))}
                          >
                            Tyhjennä
                          </button>
                        </div>
                      </div>
                      <div style={styles.small}>Mukana aina Helsinki, Vantaa ja Espoo. Tarjous näkyy vain ostajille, joille löytyy reittihinta.</div>
                      <div style={styles.noticeInfo}>
                        {processedForm.deliveryDestinations.length > 0
                          ? `${processedForm.deliveryDestinations.length} kohdetta valittu.`
                          : "Et ole vielä valinnut toimituskohteita."}{" "}
                        {processedForm.transportMode === "pickup"
                          ? "Noutomallissa kohteet voidaan valita ilman luovutuspistettä."
                          : processedForm.originPointId
                            ? `Valitusta pisteestä löytyy hinnasto ${availableProcessedDestinationCities.filter((city) => getRoutePrice(processedForm.originPointId, city, totalProcessedKilosForOffer)).length} kohteeseen.`
                            : "Valitse ensin terminaali tai keräilypiste, niin näet hinnastolliset reitit."}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                        {availableProcessedDestinationCities.map((city) => {
                          const routePrice = processedForm.originPointId ? getRoutePrice(processedForm.originPointId, city, totalProcessedKilosForOffer) : null;
                          const checked = processedForm.deliveryDestinations.includes(city);
                          const disabled = Boolean(processedForm.originPointId) && !routePrice;
                          return (
                            <label key={city} style={{ ...styles.checkboxCard, opacity: disabled ? 0.55 : 1, justifyContent: "space-between", alignItems: "flex-start" }}>
                              <span style={{ display: "flex", gap: 10 }}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={disabled}
                                  onChange={(e) => setProcessedForm((prev) => ({
                                    ...prev,
                                    deliveryDestinations: e.target.checked
                                      ? Array.from(new Set([...prev.deliveryDestinations, city]))
                                      : prev.deliveryDestinations.filter((item) => item !== city),
                                  }))}
                                />
                                <span>{city}</span>
                              </span>
                              <span style={styles.small}>{routePrice ? `${Number(routePrice.price_eur || 0).toLocaleString("fi-FI")} € · cutoff ${routePrice.cutoff_time || "-"}` : "Ei hinnastoa"}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={styles.field}><label>Toimitustapa</label><select style={styles.input} value={processedForm.deliveryMethod} onChange={(e) => setProcessedForm({ ...processedForm, deliveryMethod: e.target.value })}>{deliveryMethods.map((method) => <option key={method} value={method}>{method}</option>)}</select></div>
                    <div style={styles.field}>
                      <label>{processedForm.deliveryMethod === "Nouto" ? "Nouto-osoite" : "Toimitusalue"}</label>
                      {processedForm.deliveryMethod === "Nouto" ? (
                        <input style={styles.input} value={processedForm.deliveryArea} onChange={(e) => setProcessedForm({ ...processedForm, deliveryArea: e.target.value })} placeholder="Esim. Jalostamontie 4, Lappeenranta" />
                      ) : (
                        <MultiCityInput
                          value={processedForm.deliveryArea}
                          onChange={(cities) => setProcessedForm({ ...processedForm, deliveryArea: formatDeliveryDestinations(cities) })}
                          suggestions={[...suggestedProcessedDeliveryCities, ...availableProcessedDestinationCities]}
                          label="Valitut toimituskaupungit"
                        />
                      )}
                    </div>
                    <div style={styles.field}>
                      <label>Toimituskustannus €</label>
                      <input
                        style={styles.input}
                        type="text"
                        inputMode="decimal"
                        value={processedForm.deliveryCost}
                        onChange={(e) => setProcessedForm({ ...processedForm, deliveryCost: e.target.value })}
                        placeholder="Esim. 65,00"
                      />
                    </div>
                  </>
                )}
                <div style={{ ...styles.field, ...styles.fieldFull }}>
                  <label>Tarjoa jaloste-erää myyntiin</label>
                  <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                    <label><input type="checkbox" checked={processedForm.offerToShops} onChange={(e) => setProcessedForm({ ...processedForm, offerToShops: e.target.checked })} /> Kauppoihin</label>
                    <label><input type="checkbox" checked={processedForm.offerToRestaurants} onChange={(e) => setProcessedForm({ ...processedForm, offerToRestaurants: e.target.checked })} /> Ravintoloihin</label>
                    <label><input type="checkbox" checked={processedForm.offerToWholesalers} onChange={(e) => setProcessedForm({ ...processedForm, offerToWholesalers: e.target.checked })} /> Tukkuihin</label>
                  </div>
                </div>
                  </>
                ) : null}
                <div style={{ ...styles.field, ...styles.fieldFull }}><label>Lisätiedot</label><textarea style={styles.textarea} value={processedForm.notes} onChange={(e) => setProcessedForm({ ...processedForm, notes: e.target.value })} placeholder="Esim. allergeenit, säilytys, pakkausmuoto, toimitusrytmi" /></div>
              </div>
              <div style={{ ...styles.rowBetween, gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ ...styles.row, gap: 8, fontWeight: 600, color: "#334155" }}>
                  <input
                    type="checkbox"
                    checked={saveProcessedAsProduct}
                    onChange={(e) => setSaveProcessedAsProduct(e.target.checked)}
                  />
                  <span>Tallenna erä omiin tuotteisiin</span>
                </label>
                <button style={{ ...styles.button, ...styles.primaryButton }} onClick={handleSaveProcessed} disabled={saving}>{saving ? "Tallennetaan..." : shouldSendProcessedOffer ? "Tallenna jaloste-erä ja lähetä tarjous" : "Tallenna jaloste-erä"}</button>
              </div>
            </div>
          ) : (
            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
              <div style={formGrid}>
                <div style={styles.field}><label>Pyyntipäivämäärä</label><input style={styles.input} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
                <div style={styles.field}>
                  <label>Kalastamisalue</label>
                  <select
                    style={styles.input}
                    value={catchAreaSelector}
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      setCatchAreaSelector(nextValue);
                      if (nextValue !== CUSTOM_LAKE_AREA_OPTION && nextValue !== CUSTOM_SEA_AREA_OPTION) {
                        setForm({ ...form, area: nextValue });
                      }
                    }}
                  >
                    {defaultAreas.map((area) => <option key={area} value={area}>{area}</option>)}
                    {savedCustomLakeAreas.length > 0 ? <option disabled value="__custom_lake_separator__">-- Omat järvialueet --</option> : null}
                    {savedCustomLakeAreas.map((area) => <option key={`catch-lake-${area}`} value={area}>{area}</option>)}
                    {savedCustomSeaAreas.length > 0 ? <option disabled value="__custom_sea_separator__">-- Omat merialueet --</option> : null}
                    {savedCustomSeaAreas.map((area) => <option key={`catch-sea-${area}`} value={area}>{area}</option>)}
                    <option value={CUSTOM_LAKE_AREA_OPTION}>Muu järvi</option>
                    <option value={CUSTOM_SEA_AREA_OPTION}>Merialue (muu)</option>
                  </select>
                </div>
                {catchAreaSelector === CUSTOM_LAKE_AREA_OPTION || catchAreaSelector === CUSTOM_SEA_AREA_OPTION ? (
                  <div style={styles.field}>
                    <label>{catchAreaSelector === CUSTOM_SEA_AREA_OPTION ? "Kirjoita merialue" : "Kirjoita järven nimi"}</label>
                    <input
                      style={styles.input}
                      value={form.area}
                      onChange={(e) => setForm({ ...form, area: e.target.value })}
                      placeholder={catchAreaSelector === CUSTOM_SEA_AREA_OPTION ? "Esim. Merenkurkku" : "Esim. Puumalan Lietvesi"}
                    />
                  </div>
                ) : null}
                <div style={styles.field}>
                  <label>Paikkakunta</label>
                  <MunicipalitySelect value={form.municipality} onChange={(e) => setForm({ ...form, municipality: e.target.value })} />
                </div>
                <div style={styles.field}>
                  <label>Purkamispaikka</label>
                  <LandingPlaceInput
                    value={form.landingPlace}
                    onChange={(e) => setForm({ ...form, landingPlace: e.target.value })}
                    options={savedLandingPlaces}
                  />
                  <div style={{ ...styles.small, marginTop: 6 }}>
                    Kirjaa purkamispaikka aina tähän. Virallinen saalisilmoitus tarvitsee purkamispaikan numeroinnin.
                  </div>
                </div>
                <div style={styles.field}><label>Tarkempi pyyntipaikka</label><input style={styles.input} value={form.spot} onChange={(e) => setForm({ ...form, spot: e.target.value })} placeholder="Esim. Isoselkä" /></div>
                <div style={styles.field}><label>Kirjaaja</label><input style={styles.input} value={profile.display_name} disabled /></div>
                {commercialFishingVesselOptions.length > 0 ? (
                  <div style={styles.field}>
                    <label>Käytetty kaupallinen kalastusalus</label>
                    <label style={{ ...styles.row, gap: 8, marginBottom: 8, fontWeight: 500, color: "#334155" }}>
                      <input
                        type="checkbox"
                        checked={Boolean(form.fishingWithoutVessel)}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            fishingWithoutVessel: e.target.checked,
                            selectedVesselId: e.target.checked ? "" : (prev.selectedVesselId || commercialFishingVesselOptions[0] || ""),
                          }))}
                      />
                      <span>Kalastus ilman alusta</span>
                    </label>
                    <select
                      style={styles.input}
                      value={form.selectedVesselId}
                      disabled={Boolean(form.fishingWithoutVessel)}
                      onChange={(e) => setForm({ ...form, selectedVesselId: e.target.value })}
                    >
                      {commercialFishingVesselOptions.map((vesselId) => (
                        <option key={vesselId} value={vesselId}>
                          {vesselId}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div style={styles.field}>
                    <label>Käytetty kaupallinen kalastusalus</label>
                    <label style={{ ...styles.row, gap: 8, marginTop: 8, fontWeight: 500, color: "#334155" }}>
                      <input
                        type="checkbox"
                        checked={Boolean(form.fishingWithoutVessel)}
                        onChange={(e) => setForm((prev) => ({ ...prev, fishingWithoutVessel: e.target.checked }))}
                      />
                      <span>Kalastus ilman alusta</span>
                    </label>
                  </div>
                )}
                <div style={{ ...styles.field, ...styles.fieldFull, ...styles.speciesBox, ...styles.stack }}>
                  <div style={styles.rowBetween}><div><label>KALAERÄ</label></div><button style={styles.button} type="button" onClick={addSpeciesRow}>Lisää laji</button></div>
                  {speciesRows.map((row, index) => {
                    const isCrayfishRow = isCrayfishSpecies(getSpeciesRowLabel(row));
                    return (
                      <div key={row.id} style={{
                        ...speciesRow,
                        ...(isCrayfishRow
                          ? {
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "stretch",
                            }
                          : {}),
                      }}>
                        <div style={styles.field}>
                          <label>Laji {index + 1}</label>
                          <FishSpeciesInput value={row.species} onChange={(e) => updateSpeciesRow(row.id, "species", e.target.value)} />
                          {row.species === "Muu" ? <input style={{ ...styles.input, marginTop: 8 }} placeholder="Kirjoita kalalaji" value={row.customSpecies} onChange={(e) => updateSpeciesRow(row.id, "customSpecies", e.target.value)} /> : null}
                        </div>
                        {!isCrayfishRow ? (
                          <div style={styles.field}><label>Kg</label><input style={styles.input} type="number" placeholder="0" value={row.kilos} onChange={(e) => updateSpeciesRow(row.id, "kilos", e.target.value)} /></div>
                        ) : null}
                        <div style={styles.field}>
                          <label>{`Hinta ALV 0 % (€/${getSpeciesPriceUnit(getSpeciesRowLabel(row))})`}</label>
                          <input
                            style={styles.input}
                            type="text"
                            inputMode="decimal"
                            placeholder={isCrayfishRow ? "Esim. 2,00" : "Esim. 5,50"}
                            value={row.price_per_kg}
                            onChange={(e) => updateSpeciesRow(row.id, "price_per_kg", e.target.value)}
                          />
                        </div>
                        <div style={styles.field}>
                          <label>{`Hinta sis. ALV ${formatVatPercent()} % (€/${getSpeciesPriceUnit(getSpeciesRowLabel(row))})`}</label>
                          <input
                            style={styles.input}
                            type="text"
                            inputMode="decimal"
                            placeholder={isCrayfishRow ? "Esim. 2,27" : "Esim. 6,24"}
                            value={row.price_per_kg_gross_input !== ""
                              ? row.price_per_kg_gross_input
                              : row.price_per_kg === "" || row.price_per_kg == null
                                ? ""
                                : (calculateGrossPrice(parseLocaleNumber(row.price_per_kg) || 0) ?? 0).toLocaleString("fi-FI", { maximumFractionDigits: 4 })}
                            onChange={(e) => updateSpeciesRow(row.id, "price_per_kg_gross", e.target.value)}
                          />
                        </div>
                        <div style={styles.field}>
                          <label>{isCrayfishRow ? "Kpl (pakollinen)" : "Kpl"}</label>
                          <input style={styles.input} type="number" placeholder="0" value={row.count} onChange={(e) => updateSpeciesRow(row.id, "count", e.target.value)} />
                          {!isCrayfishRow ? <div style={styles.small}>Lisää tähän halutessasi kappalemäärä, niin ostaja saa tietää kalojen koon.</div> : null}
                        </div>
                        <div style={styles.row}><button style={styles.button} type="button" onClick={() => duplicateSpeciesRow(row.id)}>Kopioi</button><button style={styles.button} type="button" onClick={() => removeSpeciesRow(row.id)}>Poista</button></div>
                      </div>
                    );
                  })}
                </div>
                <div style={styles.field}><label>Pyydys</label><select style={styles.input} value={form.gear} onChange={(e) => {
                  const nextGear = e.target.value;
                  const normalizedNextGear = normalizeCatchGearValue(nextGear);
                  const nextGearDefaults = getStoredGearProfile({ gearProfiles: savedGearProfiles }, nextGear);
                  setForm((prev) => ({
                    ...prev,
                    gear: nextGear,
                    gearCount: nextGearDefaults.gearCount || "",
                    fishingDurationDays: nextGearDefaults.fishingDurationDays || "",
                    netHeight: normalizedNextGear === "Verkko" ? nextGearDefaults.netHeight || "" : "",
                    netMeshSize: normalizedNextGear === "Verkko" ? nextGearDefaults.netMeshSize || "" : "",
                    fykeHeight: normalizedNextGear === "Rysä" ? nextGearDefaults.fykeHeight || "" : "",
                  }));
                  setSavedGearCountOptions(nextGearDefaults.gearCountOptions || []);
                  setSavedFishingDurationOptions(nextGearDefaults.fishingDurationOptions || []);
                  setSavedNetHeightOptions(normalizedNextGear === "Verkko" ? nextGearDefaults.netHeightOptions || [] : []);
                  setSavedNetMeshSizeOptions(normalizedNextGear === "Verkko" ? nextGearDefaults.netMeshSizeOptions || [] : []);
                  setSavedFykeHeightOptions(normalizedNextGear === "Rysä" ? nextGearDefaults.fykeHeightOptions || [] : []);
                }}>{gearTypes.map((gear) => <option key={gear} value={gear}>{gear}</option>)}</select></div>
                <div style={styles.field}>
                  <label>Vesityyppi</label>
                  <select style={styles.input} value={form.waterType} onChange={(e) => setForm((prev) => ({ ...prev, waterType: e.target.value }))}>
                    <option value="">Valitse</option>
                    <option value={WATER_TYPE_FRESH}>Makea vesi</option>
                    <option value={WATER_TYPE_SEA}>Meri</option>
                  </select>
                </div>
                <div style={styles.field}>
                  <label>Pyydysten määrä</label>
                  <RememberedTextInput
                    value={form.gearCount}
                    onChange={(e) => setForm({ ...form, gearCount: e.target.value })}
                    options={savedGearCountOptions}
                    placeholder="Esim. 30"
                    listId="gear-count-options"
                  />
                </div>
                {getFishingDurationFieldMeta(form.gear).splitFields ? (
                  <>
                    <div style={styles.field}>
                      <label>{getFishingDurationFieldMeta(form.gear).durationLabel}</label>
                      <RememberedTextInput
                        value={parseFishingDurationValue(form.gear, form.fishingDurationDays).duration}
                        onChange={(e) => setForm((prev) => ({
                          ...prev,
                          fishingDurationDays: buildFishingDurationValue(
                            prev.gear,
                            e.target.value,
                            parseFishingDurationValue(prev.gear, prev.fishingDurationDays).speed
                          ),
                        }))}
                        options={savedFishingDurationOptions
                          .map((option) => parseFishingDurationValue(form.gear, option).duration)
                          .filter(Boolean)}
                        placeholder={getFishingDurationFieldMeta(form.gear).durationPlaceholder}
                        listId="fishing-duration-options"
                      />
                    </div>
                    <div style={styles.field}>
                      <label>{getFishingDurationFieldMeta(form.gear).speedLabel}</label>
                      <RememberedTextInput
                        value={parseFishingDurationValue(form.gear, form.fishingDurationDays).speed}
                        onChange={(e) => setForm((prev) => ({
                          ...prev,
                          fishingDurationDays: buildFishingDurationValue(
                            prev.gear,
                            parseFishingDurationValue(prev.gear, prev.fishingDurationDays).duration,
                            e.target.value
                          ),
                        }))}
                        options={savedFishingDurationOptions
                          .map((option) => parseFishingDurationValue(form.gear, option).speed)
                          .filter(Boolean)}
                        placeholder={getFishingDurationFieldMeta(form.gear).speedPlaceholder}
                        listId="fishing-speed-options"
                      />
                    </div>
                    <div style={{ ...styles.field, ...styles.fieldFull }}>
                      <div style={{ ...styles.small, marginTop: 6 }}>
                        {getFishingDurationFieldMeta(form.gear).help}
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={styles.field}>
                    <label>{getFishingDurationFieldMeta(form.gear).label}</label>
                    <RememberedTextInput
                      value={form.fishingDurationDays}
                      onChange={(e) => setForm({ ...form, fishingDurationDays: e.target.value })}
                      options={savedFishingDurationOptions}
                      placeholder={getFishingDurationFieldMeta(form.gear).placeholder}
                      listId="fishing-duration-options"
                    />
                    <div style={{ ...styles.small, marginTop: 6 }}>
                      {getFishingDurationFieldMeta(form.gear).help}
                    </div>
                  </div>
                )}
                {normalizeCatchGearValue(form.gear) === "Verkko" ? (
                  <>
                    <div style={styles.field}>
                      <label>Verkon korkeus</label>
                      <RememberedTextInput
                        value={form.netHeight}
                        onChange={(e) => setForm({ ...form, netHeight: e.target.value })}
                        options={savedNetHeightOptions}
                        placeholder="Esim. 3 m"
                        listId="net-height-options"
                      />
                    </div>
                    <div style={styles.field}>
                      <label>Verkon solmuväli</label>
                      <RememberedTextInput
                        value={form.netMeshSize}
                        onChange={(e) => setForm({ ...form, netMeshSize: e.target.value })}
                        options={savedNetMeshSizeOptions}
                        placeholder="Esim. 55 mm"
                        listId="net-mesh-options"
                      />
                    </div>
                  </>
                ) : null}
                {normalizeCatchGearValue(form.gear) === "Rysä" ? (
                  <div style={styles.field}>
                    <label>Rysän korkeus</label>
                    <RememberedTextInput
                      value={form.fykeHeight}
                      onChange={(e) => setForm({ ...form, fykeHeight: e.target.value })}
                      options={savedFykeHeightOptions}
                      placeholder="Esim. 2,5 m"
                      listId="fyke-height-options"
                    />
                  </div>
                ) : null}
                <div style={{ ...styles.field, ...styles.fieldFull }}>
                  <label style={styles.checkboxCard}>
                    <input
                      type="checkbox"
                      checked={form.listForSale}
                      disabled={fisherPremiumRequired}
                      onChange={(e) => setForm((prev) => ({
                        ...prev,
                        listForSale: e.target.checked,
                        ...(e.target.checked ? {} : {
                          offerToShops: false,
                          offerToRestaurants: false,
                          offerToWholesalers: false,
                          deliveryPossible: false,
                        }),
                      }))}
                    />
                    Laita kalaerä myyntiin
                  </label>
                </div>
                {fisherPremiumRequired ? (
                  <div style={{ ...styles.field, ...styles.fieldFull }}>
                    <div style={styles.noticeWarning}>
                      {buildFisherPremiumMessage("Myyntiin tarjoaminen")}
                    </div>
                  </div>
                ) : null}
                {form.listForSale ? (
                  <>
                <div style={styles.field}><label>Aikaisin toimitus</label><input style={styles.input} type="date" value={form.earliestDeliveryDate} onChange={(e) => setForm({ ...form, earliestDeliveryDate: e.target.value })} /></div>
                <div style={styles.field}><label><input type="checkbox" checked={form.coldTransport} onChange={(e) => setForm({ ...form, coldTransport: e.target.checked })} /> Kylmäkuljetus</label></div>
                <div style={{ ...styles.field, ...styles.fieldFull }}>
                  <div style={{ ...styles.offerBox, ...styles.stack, ...(!DELIVERY_COMPETITION_AVAILABLE ? styles.disabledSection : null) }}>
                    <label><input type="checkbox" checked={DELIVERY_COMPETITION_AVAILABLE && form.deliveryPossible} disabled /> Kilpailuta kuljetus</label>
                    <div style={styles.small}>Saatavilla myöhemmin. Tässä kohtaa voi jatkossa valita kuljetustavan, nouto-osoitteen tai lähimmän terminaalin ja toimituskohteet.</div>
                    {DELIVERY_COMPETITION_AVAILABLE && form.deliveryPossible ? (
                      <>
                        <div style={styles.field}>
                          <label>Lähtösijainti</label>
                          <MunicipalitySelect value={currentOriginCity} onChange={(e) => setForm({ ...form, originCity: e.target.value, originPointId: "" })} />
                        </div>
                        <div style={{ ...styles.field, ...styles.stack }}>
                          <label>Valitse kuljetustapa</label>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                            {[
                              { value: "pickup", title: "Kuljetusfirma noutaa", detail: "Täytät kalaerän nouto-osoitteen ja kuljetus noudetaan siitä." },
                              { value: "terminal", title: "Toimita terminaaliin", detail: "Appi näyttää lähimmät terminaalit valitun lähtösijainnin perusteella." },
                              { value: "collection_point", title: "Toimita keräilypisteeseen", detail: "Appi näyttää lähimmät keräilypisteet valitun lähtösijainnin perusteella." },
                            ].map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                style={{
                                  ...styles.button,
                                  textAlign: "left",
                                  justifyContent: "flex-start",
                                  padding: 16,
                                  minHeight: 110,
                                  background: form.transportMode === option.value ? "linear-gradient(135deg, #2563eb, #0ea5e9)" : "#f8fbff",
                                  color: form.transportMode === option.value ? "#fff" : "#0f172a",
                                  borderColor: form.transportMode === option.value ? "#2563eb" : "#bfdbfe",
                                }}
                                onClick={() => setForm((prev) => ({
                                  ...prev,
                                  deliveryMethod: "Kuljetus järjestetään",
                                  transportMode: option.value,
                                  originPointId: option.value === "pickup" ? "" : prev.originPointId,
                                  pickupAddress: option.value === "pickup" ? (prev.pickupAddress || savedPickupAddress) : prev.pickupAddress,
                                  pickupSurcharge: option.value === "pickup" ? "12" : "",
                                  estimatedPickupTime: option.value === "pickup" ? "Arkipäivisin klo 12–16" : "",
                                }))}
                              >
                                <span style={{ ...styles.stack, gap: 6 }}>
                                  <strong>{option.title}</strong>
                                  <span style={{ fontSize: 14, opacity: form.transportMode === option.value ? 0.95 : 0.75 }}>{option.detail}</span>
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
                {DELIVERY_COMPETITION_AVAILABLE && form.deliveryPossible ? (
                  <>
                    {form.transportMode === "terminal" || form.transportMode === "collection_point" ? (
                      <div style={{ ...styles.field, ...styles.fieldFull, ...styles.stack }}>
                        <label>{form.transportMode === "terminal" ? "Appin näyttämät lähimmät terminaalit" : "Appin näyttämät lähimmät keräilypisteet"}</label>
                        {availableOriginPoints.length === 0 ? (
                          <div style={styles.noticeInfo}>Tälle alueelle ei löytynyt sopivaa luovutuspistettä. Vaihda lähtöpaikkaa tai kuljetustapaa.</div>
                        ) : (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
                            {availableOriginPoints.map((point) => (
                              <button
                                key={point.id}
                                type="button"
                                style={{
                                  ...styles.button,
                                  textAlign: "left",
                                  justifyContent: "flex-start",
                                  padding: 16,
                                  minHeight: 120,
                                  background: form.originPointId === point.id ? "#eff6ff" : "#fff",
                                  borderColor: form.originPointId === point.id ? "#2563eb" : "#cbd5e1",
                                }}
                                onClick={() => setForm((prev) => ({ ...prev, originPointId: point.id }))}
                              >
                                <span style={{ ...styles.stack, gap: 6 }}>
                                  <strong>{point.name}</strong>
                                  <span style={styles.muted}>{point.address}</span>
                                  <span style={styles.small}>Viimeinen jättöaika: {point.latest_dropoff_time || "-"}</span>
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}
                    {form.transportMode === "pickup" ? (
                      <div style={{ ...styles.field, ...styles.fieldFull, ...styles.stack }}>
                        <label>Täytä kalaerän nouto-osoite</label>
                        <div style={styles.field}>
                          <label>Nouto-osoite</label>
                          <input
                            style={styles.input}
                            value={form.pickupAddress || savedPickupAddress}
                            onChange={(e) => setForm((prev) => ({ ...prev, pickupAddress: e.target.value }))}
                            placeholder="Kirjoita nouto-osoite, jos sitä ei ole tallennettu omiin tietoihin"
                          />
                        </div>
                        <div style={styles.noticeInfo}>
                          Noutopaikka: {[resolvedPickupAddress, currentOriginCity, form.spot].filter(Boolean).join(", ") || "-"}<br />
                          Noutolisä: {form.pickupSurcharge !== "" ? `${form.pickupSurcharge} €` : "-"}<br />
                          Arvioitu noutoaika: {form.estimatedPickupTime || "-"}
                        </div>
                      </div>
                    ) : null}
                    <div style={{ ...styles.field, ...styles.fieldFull, ...styles.stack }}>
                      <div style={styles.rowBetween}>
                        <label>Ehdotetut toimituskohteet lähtösijainnin perusteella</label>
                        <div style={styles.row}>
                          <button
                            type="button"
                            style={styles.button}
                            onClick={() => setForm((prev) => ({ ...prev, deliveryDestinations: getSuggestedDestinationCities(currentOriginCity, prev.area).filter((city) => !prev.originPointId || getRoutePrice(prev.originPointId, city, totalKilosForOffer)).slice(0, 10) }))}
                          >
                            Ehdota kohteet
                          </button>
                          <button
                            type="button"
                            style={styles.button}
                            onClick={() => setForm((prev) => ({
                              ...prev,
                              deliveryDestinations: availableDestinationCities.filter((city) => !prev.originPointId || getRoutePrice(prev.originPointId, city, totalKilosForOffer)),
                            }))}
                          >
                            Valitse kaikki hinnastolliset
                          </button>
                          <button
                            type="button"
                            style={styles.button}
                            onClick={() => setForm((prev) => ({ ...prev, deliveryDestinations: [] }))}
                          >
                            Tyhjennä
                          </button>
                        </div>
                      </div>
                      <div style={styles.small}>Mukana aina Helsinki, Vantaa ja Espoo. Tarjous näkyy vain ostajille, joille löytyy reittihinta.</div>
                      <div style={styles.noticeInfo}>
                        {form.deliveryDestinations.length > 0
                          ? `${form.deliveryDestinations.length} kohdetta valittu.`
                          : "Et ole vielä valinnut toimituskohteita."}{" "}
                        {form.transportMode === "pickup"
                          ? "Noutomallissa kohteet voidaan valita ilman luovutuspistettä."
                          : form.originPointId
                            ? `Valitusta pisteestä löytyy hinnasto ${availableDestinationCities.filter((city) => getRoutePrice(form.originPointId, city, totalKilosForOffer)).length} kohteeseen.`
                            : "Valitse ensin terminaali tai keräilypiste, niin näet hinnastolliset reitit."}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                        {availableDestinationCities.map((city) => {
                          const routePrice = form.originPointId ? getRoutePrice(form.originPointId, city, totalKilosForOffer) : null;
                          const checked = form.deliveryDestinations.includes(city);
                          const disabled = Boolean(form.originPointId) && !routePrice;
                          return (
                            <label key={city} style={{ ...styles.checkboxCard, opacity: disabled ? 0.55 : 1, justifyContent: "space-between", alignItems: "flex-start" }}>
                              <span style={{ display: "flex", gap: 10 }}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={disabled}
                                  onChange={(e) => setForm((prev) => ({
                                    ...prev,
                                    deliveryDestinations: e.target.checked
                                      ? Array.from(new Set([...prev.deliveryDestinations, city]))
                                      : prev.deliveryDestinations.filter((item) => item !== city),
                                  }))}
                                />
                                <span style={{ ...styles.stack, gap: 4 }}>
                                  <strong>{city}</strong>
                                  <span style={styles.small}>{routePrice ? `${formatDeliveryPrice(routePrice.price_eur)} · cut-off ${routePrice.cutoff_time}` : "Ei hinnastoa valitusta luovutuspisteestä"}</span>
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={styles.field}><label>Toimitustapa</label><select style={styles.input} value={normalizeFishermanDeliveryMethod(form.deliveryMethod)} onChange={(e) => setForm({ ...form, deliveryMethod: e.target.value })}>{fishermanDeliveryMethods.map((method) => <option key={method} value={method}>{method}</option>)}</select></div>
                    <div style={styles.field}>
                      <label>{normalizeFishermanDeliveryMethod(form.deliveryMethod) === "Nouto" ? "Nouto-osoite" : "Toimitusalue"}</label>
                      {normalizeFishermanDeliveryMethod(form.deliveryMethod) === "Nouto" ? (
                        <input
                          style={styles.input}
                          placeholder="Esim. Satamakatu 1, Kuopio"
                          value={form.deliveryArea}
                          onChange={(e) => setForm({ ...form, deliveryArea: e.target.value })}
                        />
                      ) : (
                        <MultiCityInput
                          value={form.deliveryArea}
                          onChange={(cities) => setForm({ ...form, deliveryArea: formatDeliveryDestinations(cities) })}
                          suggestions={[...suggestedDeliveryCities, ...availableDestinationCities]}
                          label="Valitut toimituskaupungit"
                        />
                      )}
                    </div>
                    <div style={styles.field}>
                      <label>Toimituskustannus €</label>
                      <input
                        style={styles.input}
                        type="text"
                        inputMode="decimal"
                        placeholder="Esim. 90,00"
                        value={form.deliveryCost}
                        onChange={(e) => setForm({ ...form, deliveryCost: e.target.value })}
                      />
                    </div>
                  </>
                )}
                <div style={{ ...styles.field, ...styles.fieldFull }}>
                  <div style={{ ...styles.offerBox, ...styles.stack }}>
                    <div>
                      <label>Tarjoa erää myyntiin</label>
                      <div style={styles.small}>Valitse ostajaryhmät, joille tämä kalaerä lähetetään heti tallennuksen yhteydessä.</div>
                    </div>
                    <div style={styles.checkboxRow}>
                      <label style={styles.checkboxCard}><input type="checkbox" checked={form.offerToShops} onChange={(e) => setForm({ ...form, offerToShops: e.target.checked })} /> Kauppoihin</label>
                      <label style={styles.checkboxCard}><input type="checkbox" checked={form.offerToRestaurants} onChange={(e) => setForm({ ...form, offerToRestaurants: e.target.checked })} /> Ravintoloihin</label>
                      <label style={styles.checkboxCard}><input type="checkbox" checked={form.offerToWholesalers} onChange={(e) => setForm({ ...form, offerToWholesalers: e.target.checked })} /> Tukkuihin</label>
                    </div>
                  </div>
                </div>
                  </>
                ) : null}
                <div style={{ ...styles.field, ...styles.fieldFull }}><label>Lisätiedot</label><textarea style={styles.textarea} placeholder="Esim. laatu, jäähdytys, toimitus, huomioita" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              </div>
              <div style={{ ...styles.row, justifyContent: "flex-end" }}><button style={{ ...styles.button, ...styles.primaryButton }} onClick={handleSave} disabled={saving}>{saving ? "Tallennetaan..." : shouldSendOffer ? "Tallenna saalis ja lähetä tarjous" : "Tallenna saalis"}</button></div>
            </div>
          )
        ) : null}

        {activeTab === "entries" ? (
          profile.role === "processor" ? (
            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
              <div style={styles.rowBetween}><strong>Omat jaloste-erät</strong><input style={{ ...styles.input, maxWidth: 360 }} placeholder="Hae tuotteella, alueella tai käsittelyllä..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
              {processedEntries.filter((entry) => {
                const q = search.trim().toLowerCase();
                if (!q) return true;
                return [entry.productName, entry.productType, entry.processingMethod, entry.speciesSummary, entry.area, entry.municipality, entry.spot, entry.notes, entry.ownerName].join(" ").toLowerCase().includes(q);
              }).length === 0 ? <div style={styles.muted}>Ei hakutuloksia.</div> : processedEntries.filter((entry) => {
                const q = search.trim().toLowerCase();
                if (!q) return true;
                return [entry.productName, entry.productType, entry.processingMethod, entry.speciesSummary, entry.area, entry.municipality, entry.spot, entry.notes, entry.ownerName].join(" ").toLowerCase().includes(q);
              }).map((entry) => (
                <div key={entry.id} style={styles.entry}>
                  <div style={styles.entryHeader}>
                    <div>
                      <div style={styles.entryBadges}>
                        <span style={styles.badge}>{entry.productName}</span>
                        <span style={styles.badge}>{entry.productType}</span>
                        <span style={styles.badge}>{entry.kilos} kg</span>
                        {entry.packageSizeG !== "" ? <span style={styles.badge}>{entry.packageSizeG} g</span> : null}
                        {entry.packageCount !== "" ? <span style={styles.badge}>{entry.packageCount} pkt</span> : null}
                      </div>
                      <div style={styles.muted}>{entry.productionDate} · {entry.area}{entry.municipality ? ` · ${entry.municipality}` : ""}{entry.spot ? ` / ${entry.spot}` : ""}</div>
                      {entry.batchId ? <div style={styles.muted}>Erätunnus: {entry.batchId}</div> : null}
                      {entry.batchId ? <div style={{ ...styles.qrBlock, marginTop: 8 }}><img src={getBatchQrImageUrl(entry.batchId)} alt={`QR ${entry.batchId}`} style={styles.qrImage} /><div style={styles.small}>QR-koodi erälle</div></div> : null}
                      <div style={styles.muted}>Raaka-aine: {entry.speciesSummary || "-"}</div>
                      {Array.isArray(entry.sourceBatches) && entry.sourceBatches.length > 0 ? (
                        <div style={{ ...styles.stack, gap: 8, marginTop: 8 }}>
                          <div style={styles.muted}><strong>Linkitetyt lähde-erät</strong></div>
                          {entry.sourceBatches.map((source) => (
                            <div key={`${entry.id}-${source.batchId}-${source.sourceEntryId || source.species}`} style={{ ...styles.entry, background: "#f8fbff", padding: 12 }}>
                              <div style={styles.rowBetween}>
                                <div style={{ ...styles.stack, gap: 6 }}>
                                  <div style={styles.muted}>Erätunnus: {source.batchId}</div>
                                  <div style={styles.muted}>Laji: {formatSpeciesForSale(source.species)}</div>
                                  <div style={styles.muted}>Määrä: {source.kilos !== "" && source.kilos != null ? `${source.kilos} kg` : "-"}</div>
                                </div>
                                {source.qrImageUrl ? (
                                  <div style={styles.qrBlock}>
                                    <img src={source.qrImageUrl} alt={`QR ${source.batchId}`} style={styles.qrImage} />
                                    <div style={styles.small}>Lähde-erän QR</div>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <div style={styles.muted}>Parasta ennen: {entry.bestBeforeDate || "-"}</div>
                      {isEntryOfferedForSale(entry) ? (
                        <div style={styles.muted}>Toimitus: {entry.deliveryMethod || "-"} · {entry.deliveryArea || "-"} · Kulu {entry.deliveryCost !== "" && entry.deliveryCost != null ? `${entry.deliveryCost} €` : "-"} · Aikaisin {entry.earliestDeliveryDate || "-"} · Kylmäkuljetus {entry.coldTransport ? "kyllä" : "ei"}</div>
                      ) : null}
                      {entry.notes ? <div style={styles.muted}>{entry.notes}</div> : null}
                    </div>
                    <div style={{ ...styles.stack, gap: 8, alignItems: "flex-end" }}>
                      <button style={styles.button} onClick={() => openProcessedLabelPrint(entry, PROCESSED_LABEL_FORMAT_4X3)}>Tulosta 4x3 etiketti</button>
                      <button style={styles.button} onClick={() => openProcessedLabelPrint(entry, PROCESSED_LABEL_FORMAT_4X6)}>Tulosta 4x6 etiketti</button>
                      <button style={styles.button} onClick={() => handleDeleteProcessedEntry(entry)}>Poista jaloste-erä</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
              <div style={styles.rowBetween}><strong>{profile.role === "owner" && entryScope === "all" ? "Kaikkien saaliit" : "Omat saaliit"}</strong><input style={{ ...styles.input, maxWidth: 360 }} placeholder="Hae lajilla, paikalla, pyydyksellä..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
              {groupedFilteredEntries.length === 0 ? <div style={styles.muted}>Ei hakutuloksia.</div> : groupedFilteredEntries.map((group) => (
                <div key={group.key} style={{ ...styles.stack, gap: 12 }}>
                  <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack, background: "#f8fbff" }}>
                    <div style={styles.rowBetween}>
                      <strong style={{ textTransform: "capitalize" }}>{group.label}</strong>
                      <div style={styles.entryBadges}>
                        <span style={styles.badge}>{group.entries.length} erää</span>
                        <span style={styles.badge}>{group.totalKilos.toFixed(1)} kg yhteensä</span>
                        <span style={styles.badge}>{group.forSaleKilos.toFixed(1)} kg myynnissä</span>
                      </div>
                    </div>
                    {group.speciesSummary.length > 0 ? (
                      <div style={{ ...styles.stack, gap: 8 }}>
                        <div style={styles.muted}><strong>Kalalajit kuukaudelta</strong></div>
                        {group.speciesSummary.map((item) => (
                          <div key={item.species} style={styles.rowBetween}>
                            <span>{item.species}</span>
                            <span>{item.kilos.toFixed(1)} kg</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {group.entries.map((entry) => (
                    <div key={entry.id} style={styles.entry}>
                      <div style={styles.entryHeader}>
                        <div>
                          <div style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", lineHeight: 1.1, marginBottom: 6 }}>
                            {formatSpeciesForSale(entry.species)}
                          </div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: "#1d4ed8", marginBottom: 10 }}>
                            Pyyntipäivä: {entry.date || "-"}
                          </div>
                          <div style={styles.entryBadges}>
                            <span style={styles.badge}>{entry.kilos} kg</span>
                            <span style={styles.badge}>{formatCatchGearDisplay(entry)}</span>
                            <span style={styles.badge}>{entry.ownerName}</span>
                          </div>
                          <div style={styles.muted}>{entry.area}{entry.municipality ? ` · ${entry.municipality}` : ""}{entry.spot ? ` / ${entry.spot}` : ""}</div>
                          {entry.landingPlace ? <div style={styles.muted}>Purkamispaikka: {entry.landingPlace}</div> : null}
                          {entry.batchId ? <div style={styles.muted}>Erätunnus: {entry.batchId}</div> : null}
                          {entry.batchId ? <div style={{ ...styles.qrBlock, marginTop: 8 }}><img src={getBatchQrImageUrl(entry.batchId)} alt={`QR ${entry.batchId}`} style={styles.qrImage} /><div style={styles.small}>QR-koodi erälle</div></div> : null}
                          {entry.pricePerKg !== "" && entry.pricePerKg != null ? <div style={styles.muted}>Hinta ALV 0 %: {formatEntryPrice(entry.species, entry.pricePerKg)}</div> : null}
                          {entry.pricePerKg !== "" && entry.pricePerKg != null ? <div style={styles.muted}>{`Hinta sis. ALV ${formatVatPercent()} %:`} {formatEntryGrossPrice(entry.species, entry.pricePerKg)}</div> : null}
                          {entry.gearCount ? <div style={styles.muted}>Pyydysten määrä: {entry.gearCount}</div> : null}
                          {entry.fishingDurationDays ? <div style={styles.muted}>Pyyntiaika: {entry.fishingDurationDays}</div> : null}
                          {isEntryOfferedForSale(entry) ? (
                            <div style={styles.muted}>Toimitus: {entry.deliveryMethod || "-"} · {entry.deliveryArea || "-"} · Kulu {entry.deliveryCost !== "" && entry.deliveryCost != null ? `${entry.deliveryCost} €` : "-"} · Aikaisin {entry.earliestDeliveryDate || "-"} · Kylmäkuljetus {entry.coldTransport ? "kyllä" : "ei"}</div>
                          ) : null}
                          {entry.commercialFishingId ? <div style={styles.muted}>Kaupallisen kalastajan tunnus: {entry.commercialFishingId}</div> : null}
                        </div>
                        <div style={styles.row}>
                          {canPrintCatchLabels(entry) ? (
                            <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => { setLabelPrintEntry(entry); setLabelPrintCount(isThermalCatchLabelFormat(labelPrintFormat) ? 1 : 10); }}>
                              Tulosta etiketit
                            </button>
                          ) : profile.role === "member" && !hasFisherPremium ? (
                            <button
                              style={styles.button}
                              onClick={() => showFisherPremiumRequired("Etikettien tulostus")}
                            >
                              Tulosta etiketit (Premium)
                            </button>
                          ) : null}
                          <button style={styles.button} onClick={() => handleDeleteEntry(entry)}>Poista saalistieto</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )
        ) : null}

        {activeTab === "offers" ? (
          <WholesaleOffersView
            profile={profile}
            saleEntries={profile.role === "processor" ? processedSaleEntries : saleEntries}
            offers={offers}
            buyers={buyers}
            buyerOffers={buyerOffers}
            offerForm={offerForm}
            setOfferForm={setOfferForm}
            onCreateOffer={handleCreateOffer}
            onUpdateOfferStatus={onUpdateOfferStatus}
            onUpdateBuyerOfferStatus={onUpdateBuyerOfferStatus}
            onRemoveEntryFromSale={handleRemoveEntryFromSale}
            updateFulfillmentStatus={updateFulfillmentStatus}
            requestedOfferId={requestedOfferId}
            buyerTypeLabel={buyerTypeLabel}
            buyerStatusLabel={buyerStatusLabel}
            shouldRevealBuyerIdentity={shouldRevealBuyerIdentity}
          />
        ) : null}

        {activeTab === "reports" ? <ReportsView entries={entries} processedEntries={processedEntries} offers={offers} profile={profile} /> : null}

        {activeTab === "operations" && profile.role === "owner" ? (
          <AdminOperationsView
            profile={profile}
            entries={entries}
            processedEntries={processedEntries}
            buyerOffers={buyerOffers}
            buyers={buyers}
            ownerUserProfiles={ownerUserProfiles}
            appPushTokens={appPushTokens}
            onDeleteOwnTestBuyerOffers={handleDeleteOwnTestBuyerOffers}
            deletingOwnTestBuyerOffers={deletingOwnTestBuyerOffers}
          />
        ) : null}

        {activeTab === "billing" && profile.role === "owner" ? (
          <BillingView
            buyerOffers={buyerOffers.map((offer) => ({ ...offer, ...calculateCommissionDetails(offer) }))}
            buyerStatusLabel={buyerStatusLabel}
            shouldRevealBuyerIdentity={shouldRevealBuyerIdentity}
            billingFilter={billingFilter}
            setBillingFilter={setBillingFilter}
            onUpdateBillingStatus={handleUpdateOwnerCommissionStatus}
          />
        ) : null}

        {activeTab === "billing" && profile.role === "member" ? (
            <SellerBillingView
              profile={profile}
              accountForm={accountForm}
              setAccountForm={setAccountForm}
              sendInvoiceCopyToSelf={sendInvoiceCopyToSelf}
              setSendInvoiceCopyToSelf={setSendInvoiceCopyToSelf}
              sendInvoiceCopyToAccountant={sendInvoiceCopyToAccountant}
              setSendInvoiceCopyToAccountant={setSendInvoiceCopyToAccountant}
              accountSaving={accountSaving}
              onSaveBankDetails={handleSaveOwnDetails}
              buyerOffers={buyerOffers}
              billingFilter={billingFilter}
              setBillingFilter={setBillingFilter}
              onOpenInvoicePdf={handleOpenSellerInvoicePdf}
              onViewInvoicePdf={handleViewSellerInvoicePdf}
              onSendInvoicePdf={handleSendSellerInvoicePdf}
              onUpdateBillingStatus={handleUpdateSellerBillingStatus}
              onOpenGroupInvoicePdf={handleOpenSellerGroupInvoicePdf}
              onViewGroupInvoicePdf={handleViewSellerGroupInvoicePdf}
              onSendGroupInvoicePdf={handleSendSellerGroupInvoicePdf}
              onUpdateGroupBillingStatus={handleUpdateSellerGroupBillingStatus}
            />
        ) : null}

        {activeTab === "buyers" && profile.role === "owner" ? (
          <div style={grid2}>
            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
              <div style={styles.noticeInfo}>Owner näkee ostajarekisterin. Tavalliset käyttäjät eivät näe ostajien tietoja.

Tarjouslogiikka:
• Tukut: tarjous lähetetään vain jos erän koko on vähintään tukun määrittämä minimimäärä (min kg).
• Ravintolat: tarjous lähetetään vain jos erän koko on enintään ravintolan määrittämä maksimimäärä (max kg).
• Kaupat: tarjous lähetetään vain jos erän koko on kaupan min- ja max-rajan välissä.

Jokaiselle ostajalle lähetetään oma sähköposti, joten ostajat eivät näe toistensa yhteystietoja.</div>
              <div style={styles.field}><label>Yritys</label><input style={styles.input} value={buyerForm.company_name} onChange={(e) => setBuyerForm((prev) => ({ ...prev, company_name: e.target.value }))} placeholder="Esim. Ravintola Saimaa" /></div>
              <div style={styles.field}>
                <label>Roolit</label>
                <div style={{ ...styles.row, flexWrap: "wrap", gap: 12 }}>
                  {["ravintola", "tukku", "kauppa"].map((buyerTypeOption) => (
                    <label key={buyerTypeOption} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={parseBuyerTypes(buyerForm.buyer_type).includes(buyerTypeOption)}
                        onChange={(e) => setBuyerForm((prev) => ({
                          ...prev,
                          buyer_type: toggleBuyerTypeSelection(prev.buyer_type, buyerTypeOption, e.target.checked),
                        }))}
                      />
                      {buyerTypeTextLabel(buyerTypeOption)}
                    </label>
                  ))}
                </div>
              </div>
              <div style={styles.field}><label>Yhteyshenkilö</label><input style={styles.input} value={buyerForm.contact_name} onChange={(e) => setBuyerForm((prev) => ({ ...prev, contact_name: e.target.value }))} placeholder="Nimi" /></div>
              <div style={styles.field}><label>Sähköposti</label><input style={styles.input} type="email" value={buyerForm.email} onChange={(e) => setBuyerForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="email@yritys.fi" /></div>
              <div style={styles.field}><label>Puhelin</label><input style={styles.input} value={buyerForm.phone} onChange={(e) => setBuyerForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="Puhelin" /></div>
              <div style={styles.field}><label>Paikkakunta</label><MunicipalitySelect value={buyerForm.city} onChange={(e) => setBuyerForm((prev) => ({ ...prev, city: e.target.value }))} /></div>
              <div style={styles.field}><label>Min kg</label><input style={styles.input} type="number" value={buyerForm.min_kg} onChange={(e) => setBuyerForm((prev) => ({ ...prev, min_kg: e.target.value }))} placeholder="Esim. tukkuille" /></div>
              <div style={styles.field}><label>Max kg</label><input style={styles.input} type="number" value={buyerForm.max_kg} onChange={(e) => setBuyerForm((prev) => ({ ...prev, max_kg: e.target.value }))} placeholder="Esim. ravintoloille" /></div>
              <div style={{ ...styles.noticeInfo, marginTop: -4 }}>Jätä tyhjäksi tai aseta 0, jos ostajalla ei ole määrärajaa.</div>
              <div style={styles.field}><label><input type="checkbox" checked={buyerForm.is_active} onChange={(e) => setBuyerForm((prev) => ({ ...prev, is_active: e.target.checked }))} /> Aktiivinen</label></div>
              <div style={styles.field}><label>Toimitusosoite</label><input style={styles.input} value={buyerForm.delivery_address} onChange={(e) => setBuyerForm((prev) => ({ ...prev, delivery_address: e.target.value, ...(buyerBillingSameAsDelivery ? { billing_address: e.target.value } : {}) }))} placeholder="Katuosoite" /></div>
              <div style={styles.field}><label>Toimitus postinumero</label><input style={styles.input} value={buyerForm.delivery_postcode} onChange={(e) => setBuyerForm((prev) => ({ ...prev, delivery_postcode: e.target.value, ...(buyerBillingSameAsDelivery ? { billing_postcode: e.target.value } : {}) }))} placeholder="00100" /></div>
              <div style={styles.field}><label>Toimitus kaupunki</label><MunicipalitySelect value={buyerForm.delivery_city} onChange={(e) => setBuyerForm((prev) => ({ ...prev, delivery_city: e.target.value, ...(buyerBillingSameAsDelivery ? { billing_city: e.target.value } : {}) }))} /></div>
              <div style={{ ...styles.field, ...styles.fieldFull }}><label><input type="checkbox" checked={buyerBillingSameAsDelivery} onChange={(e) => {
                const checked = e.target.checked;
                setBuyerBillingSameAsDelivery(checked);
                if (checked) applyBuyerDeliveryToBilling();
              }} /> Laskutustiedot samat kuin toimitustiedot</label></div>
              <div style={styles.field}><label>Laskutusosoite</label><input style={styles.input} value={buyerForm.billing_address} onChange={(e) => setBuyerForm((prev) => ({ ...prev, billing_address: e.target.value }))} placeholder="Katuosoite" /></div>
              <div style={styles.field}><label>Laskutus postinumero</label><input style={styles.input} value={buyerForm.billing_postcode} onChange={(e) => setBuyerForm((prev) => ({ ...prev, billing_postcode: e.target.value }))} placeholder="00100" /></div>
              <div style={styles.field}><label>Laskutus kaupunki</label><MunicipalitySelect value={buyerForm.billing_city} onChange={(e) => setBuyerForm((prev) => ({ ...prev, billing_city: e.target.value }))} /></div>
              <div style={styles.field}><label>Laskutussähköposti</label><input style={styles.input} type="email" value={buyerForm.billing_email} onChange={(e) => setBuyerForm((prev) => ({ ...prev, billing_email: e.target.value }))} placeholder="laskutus@yritys.fi" /></div>
              <div style={styles.field}><label>Y-tunnus</label><input style={styles.input} value={buyerForm.business_id} onChange={(e) => setBuyerForm((prev) => ({ ...prev, business_id: e.target.value }))} placeholder="1234567-8" /></div>
              <div style={styles.field}><label>Lisätiedot</label><textarea style={styles.textarea} value={buyerForm.notes} onChange={(e) => setBuyerForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Erätoiveet, toimitus, huomioita" /></div>
              {userMessage ? <div style={styles.noticeSuccess}>{userMessage}</div> : null}
              <div style={styles.row}>
                <button style={{ ...styles.button, ...styles.primaryButton }} onClick={handleSaveBuyer}>{buyerForm.id ? "Tallenna muutokset" : "Lisää ostaja"}</button>
                {buyerForm.id ? <button style={styles.button} onClick={resetBuyerForm}>Peruuta muokkaus</button> : null}
              </div>
            </div>
            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
              <strong>Ostajarekisteri</strong>
              {buyers.length === 0 ? <div style={styles.muted}>Ei vielä ostajia.</div> : buyers.map((buyer) => (
                <div key={buyer.id} style={styles.entry}>
                  <div style={styles.entryHeader}>
                    <div>
                      <div style={styles.entryBadges}>
                        <span style={styles.badge}>{buyer.company_name}</span>
                        <span style={styles.badge}>{buyerTypesBadgeLabel(buyer.buyer_type)}</span>
                        <span style={styles.badge}>{buyer.email}</span>
                        <span style={styles.badge}>{buyer.is_active ? "Aktiivinen" : "Pois käytöstä"}</span>
                        {getOptionalKgLimit(buyer.min_kg) != null ? <span style={styles.badge}>Min {getOptionalKgLimit(buyer.min_kg)} kg</span> : null}
                        {getOptionalKgLimit(buyer.max_kg) != null ? <span style={styles.badge}>Max {getOptionalKgLimit(buyer.max_kg)} kg</span> : null}
                      </div>
                      <div style={styles.muted}>{buyer.contact_name || "-"}{buyer.phone ? ` · ${buyer.phone}` : ""}{buyer.city ? ` · ${buyer.city}` : ""}</div>
                      {buyer.notes ? <div style={styles.muted}>{buyer.notes}</div> : null}
                      {(buyer.delivery_address || buyer.delivery_postcode || buyer.delivery_city) ? <div style={styles.muted}><strong>Toimitus:</strong> {[buyer.delivery_address, buyer.delivery_postcode, buyer.delivery_city].filter(Boolean).join(", ")}</div> : null}
                      {(buyer.billing_address || buyer.billing_postcode || buyer.billing_city || buyer.billing_email || buyer.business_id) ? <div style={styles.muted}><strong>Laskutus:</strong> {[buyer.billing_address, buyer.billing_postcode, buyer.billing_city].filter(Boolean).join(", ")}{buyer.billing_email ? ` · ${buyer.billing_email}` : ""}{buyer.business_id ? ` · Y-tunnus ${buyer.business_id}` : ""}</div> : null}
                    </div>
                    <div style={styles.row}>
                      <button style={styles.button} onClick={() => startEditBuyer(buyer)}>Muokkaa</button>
                      <button style={styles.button} onClick={() => toggleBuyerActive(buyer)}>{buyer.is_active ? "Poista käytöstä" : "Aktivoi"}</button>
                      <button
                        style={{ ...styles.button, borderColor: "#fca5a5", color: "#b91c1c", background: "#fff1f2" }}
                        onClick={() => deleteBuyer(buyer)}
                      >
                        Poista kokonaan
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {activeTab === "users" && profile.role === "owner" ? (
          <div style={grid2}>
            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
              <div style={styles.noticeInfo}>Lisää tähän uuden käyttäjän sähköposti ja rooli. Ostaja ja kalastaja pääsevät käyttämään appia heti rekisteröitymisen jälkeen, kun taas erikoisroolit voidaan edelleen hyväksyä erikseen.</div>
              <div style={styles.field}><label>Nimi</label><input style={styles.input} value={newAllowedForm.displayName} onChange={(e) => setNewAllowedForm((prev) => ({ ...prev, displayName: e.target.value }))} placeholder="Esim. Antti Kalastaja" /></div>
              <div style={styles.field}><label>Sähköposti</label><input style={styles.input} type="email" value={newAllowedForm.email} onChange={(e) => setNewAllowedForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="esim. antti@yritys.fi" /></div>
              <div style={styles.field}><label>Rooli</label><select style={styles.input} value={newAllowedForm.role} onChange={(e) => setNewAllowedForm((prev) => ({ ...prev, role: e.target.value }))}><option value="member">Kalastaja</option><option value="processor">Jalostaja</option><option value="buyer">Ostaja</option><option value="owner">Omistaja</option></select></div>
              {newAllowedForm.role === "buyer" ? (
                <div style={styles.field}>
                  <label>Liitetty ostaja</label>
                  <select
                    style={styles.input}
                    value={newAllowedForm.buyer_id}
                    onChange={(e) => setNewAllowedForm((prev) => ({ ...prev, buyer_id: e.target.value }))}
                  >
                    <option value="">Valitse ostaja</option>
                    {buyers.map((buyer) => (
                      <option key={buyer.id} value={buyer.id}>
                        {buyer.company_name} ({buyer.email})
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {userMessage ? <div style={styles.noticeSuccess}>{userMessage}</div> : null}
              <button style={{ ...styles.button, ...styles.primaryButton }} onClick={handleCreateAllowedUser}>Lisää sallittuihin</button>
            </div>
            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
              <strong>Käyttäjähallinta</strong>
              {pendingProfiles.length > 0 ? (
                <div style={{ ...styles.stack, marginBottom: 12 }}>
                  <div style={{ ...styles.card, ...styles.sectionCard, padding: "12px 16px", background: "#fff7ed", borderColor: "#fdba74" }}>
                    <strong>Odottaa hyväksyntää</strong>
                  </div>
                  {pendingProfiles.map((pendingProfile) => (
                    <div key={pendingProfile.id} style={styles.entry}>
                      <div style={styles.entryHeader}>
                        <div>
                          <div style={styles.entryBadges}>
                            <span style={styles.badge}>{pendingProfile.display_name || "-"}</span>
                            <span style={styles.badge}>{pendingProfile.email}</span>
                            <span style={styles.badge}>{roleLabel(pendingProfile.role)}</span>
                            <span style={{ ...styles.badge, background: "#fff7ed", borderColor: "#fdba74", color: "#9a3412" }}>Odottaa hyväksyntää</span>
                          </div>
                          {(pendingProfile.company_name || pendingProfile.phone || pendingProfile.city) ? (
                            <div style={styles.muted}>
                              {[pendingProfile.company_name, pendingProfile.phone, pendingProfile.city].filter(Boolean).join(" · ")}
                            </div>
                          ) : null}
                        </div>
                        <div style={styles.row}>
                          <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => handleApprovePendingProfile(pendingProfile)}>Hyväksy</button>
                          <button
                            style={{ ...styles.button, borderColor: "#fca5a5", color: "#b91c1c", background: "#fff1f2" }}
                            onClick={() => handleRejectPendingProfile(pendingProfile)}
                          >
                            Hylkää
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {allowedUsers.length === 0 ? <div style={styles.muted}>Ei vielä sallittuja käyttäjiä.</div> : (
                (() => {
                  const userSections = [
                    {
                      title: "Roolipyynnöt ja ei-aktiiviset",
                      description: "Hyväksyntää odottavat ja pois käytöstä olevat käyttäjät.",
                      tone: { background: "#fff7ed", borderColor: "#fdba74", color: "#9a3412" },
                      items: allowedUsers.filter((user) => !user.is_active),
                    },
                    {
                      title: "Kalastajat",
                      description: "Tarkein ryhma: aktiiviset kalastajakäyttäjät.",
                      tone: { background: "#eff6ff", borderColor: "#93c5fd", color: "#1d4ed8" },
                      items: allowedUsers.filter((user) => user.is_active && user.role === "member"),
                    },
                    {
                      title: "Jalostajat",
                      description: "Aktiiviset jalostajaroolit.",
                      tone: { background: "#f0fdf4", borderColor: "#86efac", color: "#166534" },
                      items: allowedUsers.filter((user) => user.is_active && user.role === "processor"),
                    },
                    {
                      title: "Ownerit",
                      description: "Ylläpitäjät ja omistajaroolit.",
                      tone: { background: "#faf5ff", borderColor: "#d8b4fe", color: "#7c3aed" },
                      items: allowedUsers.filter((user) => user.is_active && user.role === "owner"),
                    },
                  ];

                  return userSections.map((section) => (
                    section.items.length === 0 ? null : (
                      <div key={section.title} style={styles.stack}>
                        <div
                          style={{
                            ...styles.card,
                            ...styles.sectionCard,
                            padding: "12px 16px",
                            background: section.tone.background,
                            borderColor: section.tone.borderColor,
                          }}
                        >
                          <strong style={{ color: section.tone.color }}>{section.title} ({section.items.length})</strong>
                          {section.description ? <div style={{ ...styles.muted, marginTop: 4 }}>{section.description}</div> : null}
                        </div>
                        {section.items.map((user) => {
                          const linkedBuyer = buyers.find((buyer) => buyer.id === user.buyer_id);
                          const linkedProfile = ownerUserProfiles.find((profileRow) => (
                            String(profileRow.id || "") === String(user.id || "") ||
                            normalizeEmail(profileRow.email) === normalizeEmail(user.email)
                          ));
                          const profileSummary = [
                            linkedProfile?.company_name,
                            linkedProfile?.phone,
                            linkedProfile?.city,
                          ].filter(Boolean).join(" · ");
                          const profileBillingLine = [
                            linkedProfile?.billing_address,
                            linkedProfile?.billing_postcode,
                            linkedProfile?.billing_city,
                          ].filter(Boolean).join(", ");
                          return (
                            <div key={user.id} style={styles.entry}>
                              <div style={styles.entryHeader}>
                                <div>
                                  <div style={styles.entryBadges}>
                                    <span style={styles.badge}>{user.display_name}</span>
                                    <span style={styles.badge}>{user.email}</span>
                                    <span style={styles.badge}>{roleLabel(user.role)}</span>
                                    <span style={styles.badge}>{user.is_active ? "Aktiivinen" : "Pois käytöstä"}</span>
                                    {user.role === "member" ? (
                                      <span style={{ ...styles.badge, background: linkedProfile?.fisher_premium_enabled ? "#ecfdf5" : "#fff7ed", borderColor: linkedProfile?.fisher_premium_enabled ? "#86efac" : "#fdba74", color: linkedProfile?.fisher_premium_enabled ? "#166534" : "#9a3412" }}>
                                        {linkedProfile?.fisher_premium_enabled ? "Premium" : "Ilmainen"}
                                      </span>
                                    ) : null}
                                    {linkedBuyer ? <span style={styles.badge}>Ostaja: {linkedBuyer.company_name}</span> : null}
                                  </div>
                                  {profileSummary ? <div style={styles.muted}>{profileSummary}</div> : null}
                                  {linkedProfile?.address || linkedProfile?.postcode || linkedProfile?.city ? (
                                    <div style={styles.muted}>
                                      <strong>Osoite:</strong> {[linkedProfile?.address, linkedProfile?.postcode, linkedProfile?.city].filter(Boolean).join(", ")}
                                    </div>
                                  ) : null}
                                  {profileBillingLine || linkedProfile?.billing_email || linkedProfile?.business_id ? (
                                    <div style={styles.muted}>
                                      <strong>Laskutus:</strong> {profileBillingLine || "-"}{linkedProfile?.billing_email ? ` · ${linkedProfile.billing_email}` : ""}{linkedProfile?.business_id ? ` · Y-tunnus ${linkedProfile.business_id}` : ""}
                                    </div>
                                  ) : null}
                                </div>
                                <div style={styles.row}>
                                  {user.role === "member" ? (
                                    <button
                                      style={linkedProfile?.fisher_premium_enabled ? styles.button : { ...styles.button, ...styles.primaryButton }}
                                      onClick={() => toggleFisherPremium(user, linkedProfile)}
                                    >
                                      {linkedProfile?.fisher_premium_enabled ? "Poista premium" : "Aktivoi premium"}
                                    </button>
                                  ) : null}
                                  {user.is_active ? (
                                    <button style={styles.button} onClick={() => toggleAllowedUserActive(user)}>Poista käytöstä</button>
                                  ) : (
                                    <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => handleApproveAllowedUser(user)}>Hyväksy</button>
                                  )}
                                  <button
                                    style={{ ...styles.button, borderColor: "#fca5a5", color: "#b91c1c", background: "#fff1f2" }}
                                    onClick={() => deleteAllowedUser(user)}
                                  >
                                    Poista kokonaan
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )
                  ));
                })()
              )}
            </div>
          </div>
        ) : null}

        {labelPrintEntry ? (
          <CatchLabelPrintModal
            entry={labelPrintEntry}
            profile={profile}
            labelCount={labelPrintCount}
            setLabelCount={setLabelPrintCount}
            printFormat={labelPrintFormat}
            setPrintFormat={setLabelPrintFormat}
            waterType={labelPrintWaterType}
            setWaterType={setLabelPrintWaterType}
            onClose={closeLabelPrintModal}
            onGeneratePdf={(selection) => openCatchLabelPrintDialog(labelPrintEntry, "pdf", selection)}
            onPrint={(selection) => openCatchLabelPrintDialog(labelPrintEntry, "print", selection)}
            viewportWidth={viewportWidth}
          />
        ) : null}
      </div>
    </div>
  );
}
