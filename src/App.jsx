import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Preferences } from "@capacitor/preferences";
import { PushNotifications } from "@capacitor/push-notifications";
import { Share } from "@capacitor/share";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import {
  createDeliveryNotePdf,
  DELIVERY_NOTE_FORMATS,
} from "./lib/deliveryNote.js";
import {
  clearBrokenSession,
  findAllowedUserByEmail,
  findAllowedUsersByEmail,
  deduplicateAllowedUsers,
  isFutureJwtClockSkewError,
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
  marineGearTypes,
  marineStatisticalRectanglesBySubdivision,
  municipalityRegionMap,
  officialMarineAreas,
  pickupPoints,
  processedProductTypes,
  processingMethods,
  routePrices,
  transportCompanies,
  transportModeLabels,
} from "./lib/constants.js";
import { applyGrossPriceInput, createSpeciesRow, safeId, today } from "./lib/helpers.js";
import {
  getMissingBuyerPurchaseFields,
  getMissingSellerSaleFields,
} from "./lib/tradeProfile.js";
import {
  ALLOWED_AUCTION_IMAGE_TYPES,
  prepareAuctionImage,
} from "./lib/auctionImage.js";
import {
  FISH_PACKAGING_OPTIONS,
  extractPackagingFromNotes,
} from "./lib/packaging.js";
import {
  getFishingVesselValidationIssue,
  getOfficialCatchSaveBlocker,
} from "./lib/catchValidationPolicy.js";
import {
  createInlandGearPreset,
  formatInlandGearPresetLabel,
  getInlandGearCode,
  getInlandGearMeta,
  getInlandGearTechnicalFields,
  getInlandGearValidationIssues,
  isInlandDualQuantitySpecies,
  normalizeInlandGearPresets,
  saveInlandGearPreset,
} from "./lib/inlandCatch.js";
import {
  getCoastalEffortValidationIssues,
  isCoastalReportSpeciesAllowed,
  isMarineFykeGear,
} from "./lib/coastalCatch.js";
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
  getNotificationRouteTarget,
  normalizeNotificationNavigationPayload,
} from "./lib/notificationRouting.js";
import {
  applyIncomingAppUrl,
  getRequestedOfferId,
  getRequestedPublicBatchId,
  leavePublicBatchView,
} from "./lib/appLinks.js";
import {
  formatSpeciesForLabelTitle,
  formatSpeciesForSale,
  getSpeciesMetadata,
  getSpeciesPriceUnit,
  getSpeciesRowLabel,
  isCrayfishSpecies,
  normalizeSpeciesDisplayLabel,
} from "./lib/species.js";
import {
  DEFAULT_PUBLIC_APP_URL,
  supabase,
} from "./lib/supabase.js";
import { tableExists } from "./services/database.js";
import {
  fetchBuyerReport,
  getPublicBatchInfoUrl,
  invokeAdminDeleteEntity,
  invokeDeleteOwnAccount,
  invokeBuyerOfferAction,
  invokeBulkOfferDispatch,
  invokeEdgeFunctionAuthenticated,
  verifyAppleSubscription,
  verifyGooglePlaySubscription,
} from "./services/edgeFunctions.js";
import {
  APPLE_FISHER_PREMIUM_PRODUCT_ID,
  findAppleFisherPremiumPurchase,
  finishAppleStoreKitTransaction,
  getAppleFisherPremiumManagementUrl,
  getAppleFisherPremiumProduct,
  isAppleStoreKitAvailable,
  isAppleStoreKitDebugBuild,
  purchaseAppleFisherPremium,
  restoreAppleFisherPremiumPurchases,
} from "./services/appleStoreKit.js";
import {
  FISHER_PREMIUM_PRODUCT_ID,
  findFisherPremiumPurchase,
  getFisherPremiumProduct,
  getFisherPremiumManagementUrl,
  isGooglePlayBillingAvailable,
  purchaseFisherPremium,
  restoreFisherPremiumPurchases,
} from "./services/googlePlayBilling.js";
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
import AuctionsView from "./components/AuctionsView.jsx";
import {
  AccountDeletionCard,
  PendingApprovalView,
  RoleSelectionView,
} from "./components/AccountViews.jsx";
import {
  FishSpeciesInput,
  LandingPlaceInput,
  MunicipalitySelect,
  MultiCityInput,
  RememberedTextInput,
} from "./components/FormInputs.jsx";
import PersistentAppNavigation from "./components/PersistentAppNavigation.jsx";
import AuthView from "./components/AuthView.jsx";
import PublicApp from "./public/PublicApp.jsx";
import ConsumerApp from "./public/ConsumerApp.jsx";
import ConsumerSellerPanel from "./components/ConsumerSellerPanel.jsx";
import { getConsumerListingUrl, getRequestedConsumerListingId } from "./lib/consumerMarketplace.js";
import { AUCTION_DURATION_OPTIONS, normalizeAuctionMoney } from "./lib/auctionLogic.js";
import ProcessedLabel4x3, { PROCESSED_LABEL_4X3_SIZE_MM } from "./components/ProcessedLabel4x3.jsx";
import ProcessedLabel4x6, { PROCESSED_LABEL_4X6_SIZE_MM } from "./components/ProcessedLabel4x6.jsx";
import ThermalLabel4x3, { THERMAL_LABEL_4X3_SIZE_MM } from "./components/ThermalLabel4x3.jsx";
import ThermalLabel4x6Portrait, { THERMAL_LABEL_4X6_SIZE_MM } from "./components/ThermalLabel4x6Portrait.jsx";
import helpGuideMarkdown from "../KAYTTOOHJE.md?raw";

const AUCTION_IMAGE_BUCKET = "auction-images";

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

function formatVisibleAuthErrorMessage(message) {
  const text = String(message || "").trim();
  if (!text) return "";
  if (isTransientFetchError(text)) {
    return "";
  }
  if (text.toLowerCase().includes("invalid input syntax")) {
    return "Tarjousten päivitys epäonnistui virheellisen ostajatunnuksen takia. Päivitä sivu ja yritä uudelleen.";
  }
  return text;
}

function isTransientFetchError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("network request failed") ||
    message.includes("networkerror when attempting to fetch resource") ||
    message.includes("upstream connect error") ||
    message.includes("disconnect/reset before headers") ||
    message.includes("connection termination") ||
    message.includes("unable to resolve host") ||
    message.includes("no address associated with hostname") ||
    message.includes("name not resolved") ||
    isFutureJwtClockSkewError(error) ||
    message.includes("dns")
  );
}

function waitForRetry(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

function shouldFallbackBuyerOfferMutation(error) {
  const status = Number(error?.status || 0);
  const message = String(error?.message || "").toLowerCase();
  if (status === 0) return true;
  if (status === 404) return true;
  return isTransientFetchError(error);
}

const PUSH_TOKEN_STORAGE_KEY = "sk:last_push_token";
const LEGAL_TERMS_URL = "https://www.suoraankalastajalta.fi/tietosuojaseloste-ja-k%C3%A4ytt%C3%B6ehdot";
const LEGAL_TERMS_VERSION = "2026-07-22";

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

function parseCrayfishCountFromSummaryLine(line) {
  const text = String(line || "");
  const parenthesizedCount = text.match(/\(([0-9]+(?:[.,][0-9]+)?)\s*kpl\)/i);
  const directCount = text.match(/:\s*([0-9]+(?:[.,][0-9]+)?)\s*kpl/i);
  return parseLocaleNumber(parenthesizedCount?.[1] || directCount?.[1]);
}

function formatSpeciesSummaryLine(label, kilos, count) {
  if (isCrayfishSpecies(label)) {
    return `${formatSpeciesForSale(label)}: ${count > 0 ? `${count} kpl` : "-"}${kilos > 0 ? ` (${kilos} kg)` : ""}`;
  }
  return `${formatSpeciesForSale(label)}: ${kilos} kg${count > 0 ? ` (${count} kpl/kg)` : ""}`;
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
  const countPerKiloMatch = summary.match(/\(([0-9]+(?:[.,][0-9]+)?)\s*kpl\/kg\)/i);
  if (countPerKiloMatch) return `${String(countPerKiloMatch[1]).replace(".", ",")} kpl/kg`;

  const countInParenthesesMatch = summary.match(/\(([0-9]+(?:[.,][0-9]+)?)\s*kpl\)/i);
  if (countInParenthesesMatch && !isCrayfishOfferSummary(summary)) {
    return `${String(countInParenthesesMatch[1]).replace(".", ",")} kpl/kg`;
  }

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

    const parsedCount = parseCrayfishCountFromSummaryLine(line);
    if (parsedCount != null) {
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

function formatCatchEntryQuantity(entry) {
  if (isCrayfishSpecies(entry?.species)) {
    return `${Number(entry?.count || 0).toLocaleString("fi-FI")} kpl`;
  }
  return `${Number(entry?.kilos || 0).toLocaleString("fi-FI")} kg`;
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

function buildProfileAddressLine(profileLike) {
  return [
    String(profileLike?.address || "").trim(),
    String(profileLike?.postcode || "").trim(),
    String(profileLike?.city || "").trim(),
  ].filter(Boolean).join(", ");
}

function getDefaultProfilePickupAddress(profileLike) {
  const explicitPickupAddress = String(profileLike?.pickup_address || profileLike?.pickupAddress || "").trim();
  return explicitPickupAddress || buildProfileAddressLine(profileLike);
}

function resolveOfferDeliveryArea(deliveryMethod, deliveryArea, deliveryDestinations, fallbackPickupAddress = "") {
  const normalizedMethod = String(deliveryMethod || "").trim();
  const currentDeliveryArea = String(deliveryArea || "").trim();
  const destinationSummary = String(formatDeliveryDestinations(deliveryDestinations) || "").trim();
  const pickupFallback = String(fallbackPickupAddress || "").trim();

  if (normalizedMethod === "Nouto") {
    if (!currentDeliveryArea) return pickupFallback;
    if (destinationSummary && currentDeliveryArea === destinationSummary) return pickupFallback;
    return currentDeliveryArea;
  }

  return destinationSummary || currentDeliveryArea;
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

function isAuctionTradeOffer(offer) {
  return String(offer?.sale_method || "fixed_price") === "auction";
}

function extractVisibleAdditionalNotes(notes, { hideDeliveryDestinations = false } = {}) {
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
      (hideDeliveryDestinations && line.startsWith("Toimituskohteet:")) ||
      line.startsWith("Pakkaustapa:") ||
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
  return `${getPublicAppBaseUrl()}/?batch=${encodeURIComponent(batchId)}`;
}

function getBatchTraceValue(batchId) {
  if (!batchId) return "";
  return getBatchPublicUrl(batchId);
}

function getBatchQrImageUrl(batchId) {
  const traceValue = getBatchTraceValue(batchId);
  return traceValue ? `https://api.qrserver.com/v1/create-qr-code/?size=160x160&format=png&qzone=1&data=${encodeURIComponent(traceValue)}&cache=${encodeURIComponent(batchId)}` : "";
}

function canPrintCatchLabels(entry) {
  return Boolean(entry?.batchId && entry?.species && entry?.date);
}

function isRoleAutomaticallyActive(role) {
  return role === "buyer" || role === "member" || role === "consumer";
}

function isFisherPremiumProfile(profileLike) {
  if (!profileLike) return false;
  if (profileLike.role !== "member") return true;
  if (profileLike.fisher_premium_admin_enabled || profileLike.fisherPremiumAdminEnabled) return true;
  const pilotExpiryTime = Date.parse(
    profileLike.fisher_premium_pilot_expires_at || profileLike.fisherPremiumPilotExpiresAt || "",
  );
  if (Number.isFinite(pilotExpiryTime) && pilotExpiryTime > Date.now()) return true;
  const subscriptionState = String(profileLike.google_play_subscription_status || "").trim();
  const expiryTime = Date.parse(profileLike.google_play_subscription_expires_at || "");
  if (
    ["SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_IN_GRACE_PERIOD", "SUBSCRIPTION_STATE_CANCELED"].includes(subscriptionState)
    && Number.isFinite(expiryTime)
    && expiryTime > Date.now()
  ) return true;
  const appleSubscriptionState = String(profileLike.apple_subscription_status || "").trim();
  const appleExpiryTime = Date.parse(profileLike.apple_subscription_expires_at || "");
  if (
    ["ACTIVE", "IN_GRACE_PERIOD"].includes(appleSubscriptionState)
    && Number.isFinite(appleExpiryTime)
    && appleExpiryTime > Date.now()
  ) return true;
  // Compatibility while the entitlement migration is being rolled out.
  if (!("fisher_premium_admin_enabled" in profileLike) && !subscriptionState) {
    return Boolean(profileLike.fisher_premium_enabled || profileLike.fisherPremiumEnabled);
  }
  return false;
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
    entry?.offerToWholesalers ||
    entry?.offerRestricted,
  );
}

function createCatchSaleDraft(entry = {}) {
  return {
    packaging: extractPackagingFromNotes(entry?.notes) || "",
    pricePerKg: entry?.pricePerKg == null ? "" : String(entry.pricePerKg),
    offerAudience: "groups",
    selectedBuyerIds: [],
    offerToShops: false,
    offerToRestaurants: false,
    offerToWholesalers: false,
    deliveryMethod: entry?.deliveryMethod === "Myyjä toimittaa" ? "Myyjä toimittaa" : "Nouto",
    deliveryArea: entry?.deliveryArea || "",
    deliveryCost: entry?.deliveryCost == null ? "" : String(entry.deliveryCost),
    earliestDeliveryDate: entry?.earliestDeliveryDate || today(),
    coldTransport: Boolean(entry?.coldTransport),
  };
}

function formatConsumerPriceInput(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "";
  return number.toLocaleString("fi-FI", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function createConsumerSaleVariant(unitType = "package", grossPricePerKg = null) {
  const suggestedGrossPrice = Number(grossPricePerKg);
  const hasSuggestedPrice = Number.isFinite(suggestedGrossPrice) && suggestedGrossPrice > 0;
  return {
    id: safeId(),
    unitType,
    label: "",
    packageSizeKg: unitType === "package" ? "1" : "",
    unitPrice: unitType === "package" && hasSuggestedPrice ? formatConsumerPriceInput(suggestedGrossPrice) : "",
    minWeightKg: unitType === "whole_fish" ? "0,8" : "",
    maxWeightKg: unitType === "whole_fish" ? "1,2" : "",
    pricePerKg: unitType === "whole_fish" && hasSuggestedPrice ? formatConsumerPriceInput(suggestedGrossPrice) : "",
    priceAutoFilled: hasSuggestedPrice,
    availableUnits: "1",
  };
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

const CATCH_LABEL_PRODUCT_FORMS = [
  "",
  "Perattu",
  "Perattu, päätön",
  "Avattu",
  "Suomustettu",
  "Filee",
  "Nahallinen filee",
  "Suomustettu nahallinen filee",
  "Nahaton filee",
  "Nyljetty",
  "Mäti",
  "Jauhettu",
];

function buildCatchLabelData(entry, profileLike, boxNumber, totalBoxes, options = {}) {
  const originalSpecies = formatSpeciesForSale(entry?.species || "");
  const selectedProductForm = String(options?.productForm ?? getCatchLabelProductForm(entry?.species)).trim();
  const speciesMetadata = getSpeciesMetadata(entry?.species);
  const baseSpecies = String(speciesMetadata?.name_fi || originalSpecies.split(",")[0] || originalSpecies).trim();
  const species = selectedProductForm ? `${baseSpecies}, ${selectedProductForm.toLocaleLowerCase("fi-FI")}` : baseSpecies;
  const isCrayfish = isCrayfishSpecies(entry?.species);
  const pieceCount = isCrayfish && options?.pieceCount != null
    ? String(options.pieceCount).trim()
    : "";
  const weightKg = !isCrayfish && options?.weightKg != null
    ? String(options.weightKg).trim()
    : "";
  const scientificName = getCatchLabelScientificName(entry?.species);
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
  const eviraFacilityId = String(
    profileLike?.evira_facility_id ||
    profileLike?.eviraFacilityId ||
    "",
  ).trim();
  const packDate = String(entry?.packDate || entry?.createdAt || "").slice(0, 10).trim();
  const weightText = weightKg ? `${weightKg} kg` : "";
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
    productForm: selectedProductForm,
    waterType,
    waterTypeLabel: getCatchWaterTypeLabel(waterType),
    productionMethodText: buildCatchProductionMethodText(waterType, catchArea),
    harvestSourceText: getCatchHarvestSourceText(waterType),
    productStateText: getCatchProductStateText(),
    storageText: isCrayfish ? "+4–+8 °C, kosteana ja ilmavasti." : "0–2 °C",
    weightText,
    isCrayfish,
    pieceCount,
    weightKg,
    supplier,
    supplierAddress,
    supplierContact,
    eviraFacilityId,
    boxLabel,
    useByDate: String(options?.useByDate || "").trim(),
  };
}

function getCatchLabelQrImageUrl(labelData) {
  const traceValue = getBatchTraceValue(labelData?.batchId);
  return traceValue
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&format=png&qzone=1&data=${encodeURIComponent(traceValue)}&cache=${encodeURIComponent(labelData?.batchId || "")}`
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
  const dateLabel = String(entry?.useByDate || entry?.use_by_date || "").trim() ? "Viimeinen käyttöpäivä" : "Parasta ennen";
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

function fitLabelContent(root) {
  if (!root || typeof window === "undefined") return;

  const minimumFontSizePx = 1;
  const tolerancePx = 0.75;
  const textElements = Array.from(root.querySelectorAll("*"))
    .filter((element) => !["IMG", "SVG", "PATH"].includes(element.tagName))
    .filter((element) => String(element.textContent || "").trim().length > 0);

  const shrinkElementFont = (element, factor = 0.94) => {
    const currentSize = Number.parseFloat(window.getComputedStyle(element).fontSize);
    if (!Number.isFinite(currentSize) || currentSize <= minimumFontSizePx) return false;
    element.style.fontSize = `${Math.max(minimumFontSizePx, currentSize * factor)}px`;
    return true;
  };

  Array.from(root.querySelectorAll("[data-label-single-line]")).forEach((element) => {
    element.style.whiteSpace = "nowrap";
    element.style.wordBreak = "normal";
    for (let attempt = 0; attempt < 120 && element.scrollWidth > element.clientWidth + tolerancePx; attempt += 1) {
      if (!shrinkElementFont(element, 0.92)) break;
    }
  });

  const contentOverflows = () => {
    const rootRect = root.getBoundingClientRect();
    if (root.scrollWidth > root.clientWidth + tolerancePx || root.scrollHeight > root.clientHeight + tolerancePx) return true;
    return Array.from(root.querySelectorAll("*")).some((element) => {
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return false;
      const rect = element.getBoundingClientRect();
      return rect.right > rootRect.right + tolerancePx
        || rect.bottom > rootRect.bottom + tolerancePx
        || rect.left < rootRect.left - tolerancePx
        || rect.top < rootRect.top - tolerancePx
        || element.scrollWidth > element.clientWidth + tolerancePx
        || element.scrollHeight > element.clientHeight + tolerancePx;
    });
  };

  for (let attempt = 0; attempt < 120 && contentOverflows(); attempt += 1) {
    let changed = false;
    textElements.forEach((element) => {
      changed = shrinkElementFont(element) || changed;
    });
    if (!changed) break;
  }

  root.dataset.labelFitComplete = contentOverflows() ? "false" : "true";
}

function fitAllLabels(container) {
  if (!container) return;
  const roots = container.matches?.("[data-label-root]")
    ? [container]
    : Array.from(container.querySelectorAll?.("[data-label-root]") || []);
  roots.forEach((root) => fitLabelContent(root));
}

function fitLabelSingleLineFields(container) {
  if (!container || typeof window === "undefined") return;
  const tolerancePx = 0.75;
  const minimumFontSizePx = 4;
  const roots = container.matches?.("[data-label-root]")
    ? [container]
    : Array.from(container.querySelectorAll?.("[data-label-root]") || []);

  roots.forEach((root) => {
    root.querySelectorAll("[data-label-single-line]").forEach((element) => {
      element.style.whiteSpace = "nowrap";
      element.style.wordBreak = "normal";
      for (let attempt = 0; attempt < 80 && element.scrollWidth > element.clientWidth + tolerancePx; attempt += 1) {
        const currentSize = Number.parseFloat(window.getComputedStyle(element).fontSize);
        if (!Number.isFinite(currentSize) || currentSize <= minimumFontSizePx) break;
        element.style.fontSize = `${Math.max(minimumFontSizePx, currentSize * 0.94)}px`;
      }
    });
  });
}

function getLabelSingleLineFitScript() {
  return "<script>(" + (function fitPrintedSingleLineFields() {
    const run = () => {
      document.querySelectorAll("[data-label-single-line]").forEach((element) => {
        element.style.whiteSpace = "nowrap";
        element.style.wordBreak = "normal";
        for (let attempt = 0; attempt < 80 && element.scrollWidth > element.clientWidth + 0.75; attempt += 1) {
          const currentSize = Number.parseFloat(getComputedStyle(element).fontSize);
          if (!Number.isFinite(currentSize) || currentSize <= 4) break;
          element.style.fontSize = `${Math.max(4, currentSize * 0.94)}px`;
        }
      });
    };
    addEventListener("load", () => requestAnimationFrame(() => requestAnimationFrame(run)));
    addEventListener("beforeprint", run);
  }).toString() + ")();<\/script>";
}

function getLabelAutoFitScript() {
  return "<script>(" + (function autoFitPrintedLabels() {
    const run = () => {
      document.querySelectorAll("[data-label-root]").forEach((root) => {
        const minimumFontSizePx = 1;
        const tolerancePx = 0.75;
        const textElements = Array.from(root.querySelectorAll("*"))
          .filter((element) => !["IMG", "SVG", "PATH"].includes(element.tagName))
          .filter((element) => String(element.textContent || "").trim().length > 0);
        const shrink = (element, factor = 0.94) => {
          const size = Number.parseFloat(getComputedStyle(element).fontSize);
          if (!Number.isFinite(size) || size <= minimumFontSizePx) return false;
          element.style.fontSize = `${Math.max(minimumFontSizePx, size * factor)}px`;
          return true;
        };
        root.querySelectorAll("[data-label-single-line]").forEach((element) => {
          element.style.whiteSpace = "nowrap";
          element.style.wordBreak = "normal";
          for (let index = 0; index < 120 && element.scrollWidth > element.clientWidth + tolerancePx; index += 1) {
            if (!shrink(element, 0.92)) break;
          }
        });
        const overflows = () => {
          const bounds = root.getBoundingClientRect();
          if (root.scrollWidth > root.clientWidth + tolerancePx || root.scrollHeight > root.clientHeight + tolerancePx) return true;
          return Array.from(root.querySelectorAll("*")).some((element) => {
            const style = getComputedStyle(element);
            if (style.display === "none" || style.visibility === "hidden") return false;
            const rect = element.getBoundingClientRect();
            return rect.right > bounds.right + tolerancePx || rect.bottom > bounds.bottom + tolerancePx
              || rect.left < bounds.left - tolerancePx || rect.top < bounds.top - tolerancePx
              || element.scrollWidth > element.clientWidth + tolerancePx || element.scrollHeight > element.clientHeight + tolerancePx;
          });
        };
        for (let index = 0; index < 120 && overflows(); index += 1) {
          let changed = false;
          textElements.forEach((element) => { changed = shrink(element) || changed; });
          if (!changed) break;
        }
        root.dataset.labelFitComplete = overflows() ? "false" : "true";
      });
    };
    addEventListener("load", () => requestAnimationFrame(() => requestAnimationFrame(run)));
    addEventListener("beforeprint", run);
  }).toString() + ")();<\/script>";
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
    value: CATCH_LABEL_FORMAT_MUNBYN_4X3,
    label: "MUNBYN 4x3",
    description: "101.6 × 76.2 mm · 1 etiketti / sivu",
  },
  {
    value: CATCH_LABEL_FORMAT_MUNBYN_4X6,
    label: "MUNBYN 4x6",
    description: "102 × 152 mm · 1 etiketti / sivu",
  },
  {
    value: CATCH_LABEL_FORMAT_APLI_1278,
    label: "APLI 1278",
    description: "57 × 105 mm · 10 etikettiä / arkki",
  },
];

function buildCatchLabelPrintHtml(entry, profileLike, labelCount, printFormat = CATCH_LABEL_FORMAT_APLI_1278, options = {}) {
  const count = Math.max(1, Number(labelCount || 1));
  const labels = Array.from({ length: count }, (_, index) => {
    const labelData = buildCatchLabelData(entry, profileLike, index + 1, count, options);
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
        <body>${labels.map((label) => `<section class="thermal-label-page">${renderToStaticMarkup(renderThermalLabelByFormat(printFormat, label))}</section>`).join("")}${getLabelSingleLineFitScript()}</body>
      </html>
    `;
  }

  const pages = [];
  for (let index = 0; index < labels.length; index += 10) {
    pages.push(labels.slice(index, index + 10));
  }

  const renderLabel = (label) => `
    <div class="label">
      <div class="label-inner" data-label-root="true">
        <div class="label-main">
          <div class="label-main-top">
            <div class="species">${label.species || "-"}</div>
            ${label.scientificName ? `<div class="scientific">${label.scientificName}</div>` : ""}
            <div class="batch" data-label-single-line="true" style="font-size:${Math.min(7.2, (7.2 * 27) / Math.max(`Erätunnus: ${label.batchId || "-"}`.length, 1)).toFixed(2)}pt">Erätunnus: ${label.batchId || "-"}</div>
          ${label.catchArea ? `<div class="line">Pyyntialue: ${label.catchArea}</div>` : ""}
          ${label.harvestSourceText ? `<div class="line">${label.harvestSourceText}</div>` : ""}
          ${label.gearType ? `<div class="line">Pyyntimenetelmä: ${label.gearType}</div>` : ""}
          ${label.productStateText ? `<div class="line">${label.productStateText}</div>` : ""}
          ${label.catchDate ? `<div class="line catch-date">Pyyntipäivä: ${label.catchDate}</div>` : ""}
          ${label.useByDate ? `<div class="line catch-date">Viimeinen käyttöpäivä: ${label.useByDate}</div>` : ""}
          ${label.commercialFishingId ? `<div class="line">Kaupallisen kalastajan tunnus: ${label.commercialFishingId}</div>` : ""}
          <div class="line">Säilytys: ${label.storageText}</div>
        </div>
          <div class="weight-line"><span class="weight-label">${label.isCrayfish ? "Kpl:" : "Paino:"}</span>${(label.isCrayfish ? label.pieceCount : label.weightKg) ? `<span class="weight-value">${label.isCrayfish ? label.pieceCount : label.weightKg}</span>` : `<span class="weight-write"></span>`}<span class="weight-unit">${label.isCrayfish ? "kpl" : "kg"}</span></div>
          <div class="supplier-block">
            <div class="line">Toimittaja: ${label.supplier || "-"}</div>
            ${label.supplierAddress ? `<div class="line">${label.supplierAddress}</div>` : ""}
            ${label.supplierContact ? `<div class="line">${label.supplierContact}</div>` : ""}
          </div>
        </div>
        <div class="label-side">
          <div class="label-brand-row">
            ${label.eviraFacilityId ? `
              <div class="label-oval" aria-label="Laitostunnus ${label.eviraFacilityId}">
                <div class="label-oval-top">FI</div>
                <div class="label-oval-mid">${label.eviraFacilityId}</div>
                <div class="label-oval-bottom">EC</div>
              </div>
            ` : ""}
            <div class="label-brand">
              <img src="${label.logoUrl}" alt="Suoraan Kalastajalta" />
              <div class="label-brand-text">
                <div>Suoraan</div>
                <div>Kalastajalta</div>
              </div>
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
          .batch { font-size: 7.2pt; font-weight: 800; background: #eff6ff; border: 0.22mm solid #93c5fd; border-radius: 1.2mm; padding: 0.7mm 0.9mm; margin-bottom: 0.7mm; white-space: nowrap; letter-spacing: -0.02em; overflow: hidden; }
          .line { font-size: 6.25pt; line-height: 1.12; margin-bottom: 0.3mm; }
          .catch-date { font-size: 7.4pt; line-height: 1.16; font-weight: 700; margin-bottom: 0.5mm; }
          .weight-line { display: flex; align-items: flex-end; gap: 1.1mm; font-size: 6.5pt; margin: 1.25mm 0 0.35mm; min-height: 4.8mm; }
          .weight-label { font-weight: 700; white-space: nowrap; }
          .weight-write { flex: 1; min-width: 0; border-bottom: 0.45mm solid #0f172a; height: 3.1mm; }
          .weight-value { flex: 1; min-width: 0; font-weight: 700; }
          .weight-unit { font-weight: 700; white-space: nowrap; }
          .label-side { display: flex; flex-direction: column; justify-content: space-between; align-items: flex-start; min-width: 0; }
          .label-brand-row { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 0.7mm; padding-top: 0.4mm; }
          .label-brand { display: flex; flex-direction: column; align-items: center; width: 100%; padding-top: 0.6mm; }
          .label-brand img { width: 11mm; max-height: 8.5mm; object-fit: contain; margin-bottom: 0.3mm; }
          .label-brand-text { font-size: 4.5pt; line-height: 1.02; font-weight: 700; text-align: center; color: #0f172a; }
          .label-oval { flex: 0 0 auto; width: 11mm; min-height: 8mm; border: 0.28mm solid #111827; border-radius: 999px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0.35mm 0.5mm; text-align: center; }
          .label-oval-top, .label-oval-bottom { font-size: 3.8pt; line-height: 1; font-weight: 800; }
          .label-oval-mid { font-size: 4.5pt; line-height: 1.02; font-weight: 800; white-space: nowrap; }
          .label-qr { display: flex; align-items: flex-end; justify-content: flex-start; width: 100%; }
          .label-qr img { width: 18mm; height: 18mm; object-fit: contain; border: 0.22mm solid #cbd5e1; border-radius: 1.2mm; padding: 0.8mm; background: #fff; }
        </style>
      </head>
      <body>
        ${pages.map((page, pageIndex) => `<div class="sheet ${pageIndex < pages.length - 1 ? "page-break" : ""}">${page.map((label) => renderLabel(label)).join("")}</div>`).join("")}
        ${getLabelAutoFitScript()}
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

function drawFacilityOvalMark(doc, establishmentNumber, x, y, width, height) {
  const value = String(establishmentNumber || "").trim();
  if (!value) return;

  const cx = x + width / 2;
  const cy = y + height / 2;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(17, 24, 39);
  doc.setLineWidth(0.3);
  doc.ellipse(cx, cy, width / 2, height / 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(5);
  doc.text("FI", cx, y + 2.8, { align: "center" });
  doc.setFontSize(6);
  doc.text(value, cx, y + (height / 2) + 0.2, { align: "center" });
  doc.setFontSize(5);
  doc.text("EC", cx, y + height - 1.6, { align: "center" });
}

function FacilityOvalPreview({ value, width = 72, minHeight = 42, fontSize = 10 }) {
  const text = String(value || "").trim();
  if (!text) return null;

  return (
    <div
      aria-label={`Laitostunnus ${text}`}
      style={{
        width,
        minHeight,
        border: "1.5px solid #111827",
        borderRadius: 999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "3px 6px",
        textAlign: "center",
        background: "#fff",
        color: "#111827",
      }}
    >
      <div style={{ fontSize: fontSize - 2, lineHeight: 1, fontWeight: 800 }}>FI</div>
      <div style={{ fontSize, lineHeight: 1.05, fontWeight: 800, wordBreak: "break-word" }}>{text}</div>
      <div style={{ fontSize: fontSize - 2, lineHeight: 1, fontWeight: 800 }}>EC</div>
    </div>
  );
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

function isNativeIosApp() {
  if (typeof window === "undefined") return false;
  const maybeCapacitor = window.Capacitor;
  return typeof maybeCapacitor?.getPlatform === "function"
    && maybeCapacitor.getPlatform() === "ios";
}

function isIosSafariWeb() {
  if (typeof window === "undefined" || typeof navigator === "undefined" || isNativeCapacitorApp()) return false;
  const userAgent = String(navigator.userAgent || "");
  const isIos = /iPhone|iPad|iPod/i.test(userAgent)
    || (/Macintosh/i.test(userAgent) && "ontouchend" in document);
  const isWebKit = /WebKit/i.test(userAgent);
  const isOtherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/i.test(userAgent);
  return isIos && isWebKit && !isOtherBrowser;
}

let lastPresentedPdfKey = "";
let lastPresentedPdfAt = 0;
const ALL_OFFERS_TEST_BUYER_EMAIL = "testiostaja@suoraankalastajalta.fi";

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
  if (presentationKey && shouldSkipDuplicateFilePresentation(presentationKey)) {
    if (options.targetWindow && !options.targetWindow.closed) {
      try {
        options.targetWindow.close();
      } catch {
        // ignore duplicate window cleanup failures
      }
    }
    return;
  }

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
    const targetWindow = options.targetWindow && !options.targetWindow.closed
      ? options.targetWindow
      : null;
    if (targetWindow) {
      try {
        const escapedFileName = String(fileName || "PDF-tiedosto")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
        targetWindow.document.open();
        targetWindow.document.write(`<!doctype html>
          <html lang="fi">
            <head>
              <meta charset="utf-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1" />
              <title>${escapedFileName}</title>
              <style>
                html, body { height: 100%; margin: 0; background: #e2e8f0; color: #0f172a; font-family: Arial, sans-serif; }
                body { display: flex; flex-direction: column; }
                .toolbar { display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: #fff; border-bottom: 1px solid #cbd5e1; }
                .title { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; }
                .action { display: inline-flex; align-items: center; min-height: 40px; padding: 0 14px; border: 1px solid #2563eb; border-radius: 10px; color: #1d4ed8; background: #fff; font-weight: 700; text-decoration: none; }
                .primary { color: #fff; background: #2563eb; }
                .viewer { width: 100%; flex: 1; border: 0; background: #fff; }
                .fallback { padding: 24px; text-align: center; background: #fff; }
                @media (max-width: 620px) {
                  .toolbar { flex-wrap: wrap; }
                  .title { flex-basis: 100%; }
                  .action { flex: 1; justify-content: center; }
                }
              </style>
            </head>
            <body>
              <div class="toolbar">
                <div class="title">${escapedFileName}</div>
                <a class="action primary" href="${blobUrl}" target="_self">Avaa PDF</a>
                <a class="action" href="${blobUrl}" download="${escapedFileName}">Lataa PDF</a>
              </div>
              <object class="viewer" data="${blobUrl}" type="application/pdf">
                <div class="fallback">
                  PDF-esikatselua ei voitu näyttää.
                  <a href="${blobUrl}" target="_self">Avaa PDF tästä.</a>
                </div>
              </object>
            </body>
          </html>`);
        targetWindow.document.close();
        targetWindow.focus();
      } catch {
        targetWindow.location.href = blobUrl;
      }
    } else {
      const link = document.createElement("a");
      link.href = blobUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
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
    targetWindow: options.targetWindow,
  });
}

function openPendingPdfWindow() {
  if (typeof window === "undefined" || isNativeCapacitorApp()) return null;
  const pendingWindow = window.open("about:blank", "_blank");
  if (!pendingWindow) return null;
  try {
    pendingWindow.document.write(`<!doctype html><html lang="fi"><head><meta charset="utf-8" /><title>Avataan PDF...</title></head><body style="font-family: Arial, sans-serif; padding: 24px; color: #0f172a;">Avataan lasku-PDF...</body></html>`);
    pendingWindow.document.close();
  } catch {
    // ignore placeholder rendering failures
  }
  return pendingWindow;
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

async function renderMunbynLabelCanvas(label, qrDataUrl, logoDataUrl, printFormat = CATCH_LABEL_FORMAT_MUNBYN_4X3) {
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
    fitLabelSingleLineFields(host);
    await new Promise((resolve) => requestAnimationFrame(resolve));

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
    fitAllLabels(host);
    await new Promise((resolve) => requestAnimationFrame(resolve));

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
      <body>${renderToStaticMarkup(renderProcessedLabelByFormat(printFormat, label))}${getLabelAutoFitScript()}</body>
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

async function buildCatchLabelPdf(entry, profileLike, labelCount, printFormat = CATCH_LABEL_FORMAT_APLI_1278, options = {}) {
  const count = Math.max(1, Number(labelCount || 1));
  const labels = Array.from({ length: count }, (_, index) => buildCatchLabelData(entry, profileLike, index + 1, count, options));
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
    const sideHeaderX = qrX - 4.2;
    const facilityWidth = 10.5;
    const facilityHeight = 8;
    const compactLogoMaxWidth = label.eviraFacilityId ? 10.5 : logoMaxWidth;
    const compactLogoWidth = Math.min(logoWidth, compactLogoMaxWidth);
    const compactLogoHeight = Math.min(logoHeight, 8.5);
    const brandX = label.eviraFacilityId
      ? sideHeaderX + facilityWidth + 1.2
      : qrX + ((qrSize - compactLogoWidth) / 2);
    const brandY = top + 0.2;
    const textWidth = qrX - left - 2.4;
    const detailLines = [
      label.catchArea ? `Pyyntialue: ${label.catchArea}` : "",
      label.harvestSourceText || "",
      label.gearType ? `Pyyntimenetelmä: ${label.gearType}` : "",
      label.productStateText || "",
      label.catchDate ? `Pyyntipäivä: ${label.catchDate}` : "",
      label.useByDate ? `Viimeinen käyttöpäivä: ${label.useByDate}` : "",
      label.commercialFishingId ? `Kaupallisen kalastajan tunnus: ${label.commercialFishingId}` : "",
    ].filter(Boolean);
    const supplierSourceLines = [
      `Toimittaja: ${label.supplier || "-"}`,
      label.supplierAddress || "",
      label.supplierContact || "",
    ].filter(Boolean);
    let contentScale = 1;
    const getScaledLayout = (scale) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13.5 * scale);
      const species = doc.splitTextToSize(label.species || "-", textWidth);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7 * scale);
      const scientific = label.scientificName ? doc.splitTextToSize(label.scientificName, textWidth) : [];
      const details = detailLines.map((line) => {
        const emphasized = line.startsWith("Pyyntipäivä:") || line.startsWith("Viimeinen käyttöpäivä:");
        doc.setFont("helvetica", emphasized ? "bold" : "normal");
        doc.setFontSize((emphasized ? 7.6 : 6.4) * scale);
        return { emphasized, lines: doc.splitTextToSize(line, textWidth) };
      });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.2 * scale);
      const storage = doc.splitTextToSize(`Säilytys: ${label.storageText}`, textWidth);
      doc.setFontSize(6.4 * scale);
      const supplier = supplierSourceLines.flatMap((line) => doc.splitTextToSize(line, textWidth));
      const requiredHeight = (species.length * 4.8 * scale)
        + (scientific.length * 3 * scale)
        + 6.1
        + details.reduce((total, item) => total + (item.lines.length * (item.emphasized ? 3.2 : 2.8) * scale), 0)
        + 1.6
        + (storage.length * 2.8 * scale)
        + 3.4
        + 2.8
        + (supplier.length * 2.6 * scale);
      return { species, scientific, details, storage, supplier, requiredHeight };
    };
    let scaledLayout = getScaledLayout(contentScale);
    const availableTextHeight = labelHeight - (labelPaddingY * 2) - 4.2;
    while (scaledLayout.requiredHeight > availableTextHeight && contentScale > 0.12) {
      contentScale = Math.max(0.12, contentScale - 0.04);
      scaledLayout = getScaledLayout(contentScale);
    }
    let currentY = top + 4.2;

    if (logoDataUrl) {
      doc.addImage(logoDataUrl, "PNG", brandX, brandY, compactLogoWidth, compactLogoHeight);
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(label.eviraFacilityId ? 4.3 : 5.2);
    const brandCenterX = brandX + (compactLogoWidth / 2);
    doc.text("Suoraan", brandCenterX, brandY + compactLogoHeight + 2, { align: "center" });
    doc.text("Kalastajalta", brandCenterX, brandY + compactLogoHeight + 4, { align: "center" });
    if (label.eviraFacilityId) {
      drawFacilityOvalMark(doc, label.eviraFacilityId, sideHeaderX, brandY + 0.4, facilityWidth, facilityHeight);
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13.5 * contentScale);
    doc.text(scaledLayout.species, left, currentY);
    currentY += scaledLayout.species.length * 4.8 * contentScale;

    if (label.scientificName) {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      doc.setFontSize(7 * contentScale);
      doc.text(scaledLayout.scientific, left, currentY);
      currentY += scaledLayout.scientific.length * 3 * contentScale;
      doc.setTextColor(17, 24, 39);
    }

    currentY += 0.5;
    doc.setFillColor(239, 246, 255);
    doc.setDrawColor(147, 197, 253);
    doc.roundedRect(left, currentY - 2.6, textWidth, 6.2, 1.1, 1.1, "FD");
    doc.setFont("helvetica", "bold");
    const batchText = `Erätunnus: ${label.batchId || "-"}`;
    let batchFontSize = 7.6;
    doc.setFontSize(batchFontSize);
    while (batchFontSize > 1 && doc.getTextWidth(batchText) > textWidth - 2.4) {
      batchFontSize -= 0.2;
      doc.setFontSize(batchFontSize);
    }
    doc.text(batchText, left + 1.2, currentY + 1.6);
    currentY += 5.6;

    doc.setFont("helvetica", "normal");
    scaledLayout.details.forEach((item) => {
      doc.setFont("helvetica", item.emphasized ? "bold" : "normal");
      doc.setFontSize((item.emphasized ? 7.6 : 6.4) * contentScale);
      doc.text(item.lines, left, currentY);
      currentY += item.lines.length * (item.emphasized ? 3.2 : 2.8) * contentScale;
    });

    currentY += 0.8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.2 * contentScale);
    doc.text(scaledLayout.storage, left, currentY);
    currentY += scaledLayout.storage.length * 2.8 * contentScale + 0.8;

    const wrappedSupplierLines = scaledLayout.supplier;
    const supplierLineHeight = 2.6 * contentScale;
    const supplierBlockHeight = wrappedSupplierLines.length * supplierLineHeight;
    const supplierStartY = Math.max(currentY + 3.4, qrY + qrSize - supplierBlockHeight);
    const weightY = supplierStartY - 2.8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8 * contentScale);
    const quantityLabel = label.isCrayfish ? "Kpl:" : "Paino:";
    const quantityUnit = label.isCrayfish ? "kpl" : "kg";
    doc.text(quantityLabel, left, weightY);
    const printedQuantity = label.isCrayfish ? label.pieceCount : label.weightKg;
    if (printedQuantity) {
      doc.text(printedQuantity, left + 12.2, weightY);
    } else {
      doc.setLineWidth(0.45);
      doc.line(left + 12.2, weightY + 0.15, qrX - 4.2, weightY + 0.15);
    }
    doc.text(quantityUnit, qrX - 3.6, weightY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.4 * contentScale);
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

async function consumeIncomingPasswordRecoveryUrl(urlString, handlers = {}) {
  if (!urlString) return false;

  let parsedUrl;
  try {
    parsedUrl = new URL(urlString);
  } catch {
    return false;
  }

  const queryParams = new URLSearchParams(parsedUrl.search || "");
  const hashParams = new URLSearchParams(String(parsedUrl.hash || "").replace(/^#/, ""));
  const isRecoveryLink = queryParams.get("recovery") === "1"
    || queryParams.get("type") === "recovery"
    || hashParams.get("type") === "recovery";

  if (!isRecoveryLink) return false;

  try {
    let recoverySession = null;
    const authorizationCode = String(queryParams.get("code") || "").trim();
    const accessToken = String(hashParams.get("access_token") || "").trim();
    const refreshToken = String(hashParams.get("refresh_token") || "").trim();

    if (authorizationCode) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(authorizationCode);
      if (error) throw error;
      recoverySession = data?.session ?? null;
    } else if (accessToken && refreshToken) {
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) throw error;
      recoverySession = data?.session ?? null;
    } else {
      throw new Error("Palautuslinkistä puuttuvat kirjautumistiedot.");
    }

    handlers.onRecoveryReady?.(recoverySession);
    return true;
  } catch (error) {
    handlers.onRecoveryError?.(String(error?.message || error));
    return true;
  }
}

function getCatchFormDefaultsStorageKey(profileLike) {
  const profileKey = String(profileLike?.id || profileLike?.email || "").trim().toLowerCase();
  return profileKey ? `${CATCH_FORM_DEFAULTS_KEY}:${profileKey}` : CATCH_FORM_DEFAULTS_KEY;
}

const INLAND_GEAR_PRESET_OPTION_PREFIX = "inland-preset:";

function getInlandGearPresetOptionValue(presetId) {
  return `${INLAND_GEAR_PRESET_OPTION_PREFIX}${presetId}`;
}

function getInlandGearPresetIdFromOption(value) {
  const normalized = String(value || "");
  return normalized.startsWith(INLAND_GEAR_PRESET_OPTION_PREFIX)
    ? normalized.slice(INLAND_GEAR_PRESET_OPTION_PREFIX.length)
    : "";
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
    inlandGearPresets: normalizeInlandGearPresets(parsed?.inlandGearPresets),
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
      inlandGearPresets: [],
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
      inlandGearPresets: [],
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

function renderHelpInline(text, keyPrefix) {
  return String(text || "").split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) => {
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return <a key={`${keyPrefix}-link-${index}`} href={linkMatch[2]} target="_blank" rel="noreferrer">{linkMatch[1]}</a>;
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${keyPrefix}-strong-${index}`}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function HelpMarkdown({ source }) {
  const lines = String(source || "").replace(/\r/g, "").split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const Heading = level === 1 ? "h2" : level === 2 ? "h3" : "h4";
      blocks.push(
        <Heading
          key={`heading-${index}`}
          style={{
            margin: level === 1 ? "0 0 8px" : level === 2 ? "24px 0 8px" : "18px 0 6px",
            color: "#0f172a",
            lineHeight: 1.3,
          }}
        >
          {renderHelpInline(headingMatch[2], `heading-${index}`)}
        </Heading>,
      );
      index += 1;
      continue;
    }

    const unordered = line.startsWith("- ");
    const ordered = /^\d+\.\s+/.test(line);
    if (unordered || ordered) {
      const items = [];
      const listStart = index;
      while (index < lines.length) {
        const itemLine = lines[index].trim();
        const matchesList = unordered ? itemLine.startsWith("- ") : /^\d+\.\s+/.test(itemLine);
        if (!matchesList) break;
        const itemText = unordered ? itemLine.slice(2) : itemLine.replace(/^\d+\.\s+/, "");
        items.push(<li key={`item-${index}`}>{renderHelpInline(itemText, `item-${index}`)}</li>);
        index += 1;
      }
      const listStyle = { margin: "8px 0 14px", paddingLeft: 24, color: "#334155", lineHeight: 1.65 };
      blocks.push(unordered
        ? <ul key={`list-${listStart}`} style={listStyle}>{items}</ul>
        : <ol key={`list-${listStart}`} style={listStyle}>{items}</ol>);
      continue;
    }

    const paragraphLines = [line];
    const paragraphStart = index;
    index += 1;
    while (index < lines.length) {
      const nextLine = lines[index].trim();
      if (!nextLine || /^(#{1,3})\s+/.test(nextLine) || nextLine.startsWith("- ") || /^\d+\.\s+/.test(nextLine)) break;
      paragraphLines.push(nextLine);
      index += 1;
    }
    blocks.push(
      <p key={`paragraph-${paragraphStart}`} style={{ margin: "0 0 14px", color: "#334155", lineHeight: 1.65 }}>
        {renderHelpInline(paragraphLines.join(" "), `paragraph-${paragraphStart}`)}
      </p>,
    );
  }

  return <div>{blocks}</div>;
}

function getRoleHelpGuideMarkdown(role) {
  const allowedSectionNumbers = role === "buyer"
    ? new Set([1, 2, 4, 6])
    : role === "processor"
      ? new Set([1, 2, 5, 6])
      : role === "owner"
        ? new Set([1, 2, 6])
        : new Set([1, 2, 3, 6]);
  const lines = String(helpGuideMarkdown || "").split("\n");
  const sections = [];
  let currentSection = null;

  lines.forEach((line) => {
    const sectionMatch = line.match(/^##\s+(\d+)\.\s+(.+)$/);
    if (sectionMatch) {
      currentSection = {
        number: Number(sectionMatch[1]),
        title: sectionMatch[2],
        lines: [],
      };
      sections.push(currentSection);
      return;
    }
    if (currentSection) currentSection.lines.push(line);
  });

  const roleTitle = role === "buyer"
    ? "Ostajan käyttöohje"
    : role === "processor"
      ? "Jalostajan käyttöohje"
      : role === "owner"
        ? "Ylläpitäjän käyttöohje"
        : "Kalastajan käyttöohje";
  const selectedSections = sections.filter((section) => allowedSectionNumbers.has(section.number));
  const normalizedSections = selectedSections.map((section, index) => (
    [`## ${index + 1}. ${section.title}`, ...section.lines].join("\n").trim()
  ));

  return [
    `# Suoraan Kalastajalta – ${roleTitle.toLocaleLowerCase("fi-FI")}`,
    `Tässä ohjeessa näkyvät vain rooliin **${roleTitle.replace(" käyttöohje", "")}** kuuluvat toiminnot.`,
    ...normalizedSections,
  ].join("\n\n");
}

function HelpDialog({ role, onClose }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(15, 23, 42, 0.68)",
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-dialog-title"
        style={{
          width: "min(760px, 100%)",
          maxHeight: "min(88vh, 900px)",
          overflowY: "auto",
          borderRadius: 18,
          background: "#f8fafc",
          boxShadow: "0 24px 70px rgba(15, 23, 42, 0.32)",
        }}
      >
        <div style={{
          position: "sticky",
          top: 0,
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "18px 20px",
          borderBottom: "1px solid #dbeafe",
          background: "rgba(248, 250, 252, 0.97)",
        }}>
          <div>
            <h2 id="help-dialog-title" style={{ margin: 0, color: "#0f172a" }}>
              {role === "buyer" ? "Ostajan käyttöohje" : role === "processor" ? "Jalostajan käyttöohje" : role === "owner" ? "Ylläpitäjän käyttöohje" : "Kalastajan käyttöohje"}
            </h2>
            <div style={{ marginTop: 4, color: "#64748b", fontSize: 14 }}>Suoraan Kalastajalta</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Sulje käyttöohje"
            style={{
              width: 42,
              height: 42,
              flex: "0 0 42px",
              border: "1px solid #bfdbfe",
              borderRadius: 999,
              background: "#fff",
              color: "#1e3a8a",
              fontSize: 25,
              lineHeight: 1,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: 20 }}>
          <HelpMarkdown source={getRoleHelpGuideMarkdown(role)} />
        </div>
      </section>
    </div>
  );
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
  const marineArea = getOfficialMarineArea(normalized);
  if (marineArea) return marineArea.name;
  if (defaultAreas.includes(normalized)) return normalized;
  if (customSeaAreas.includes(normalized)) return CUSTOM_SEA_AREA_OPTION;
  if (customLakeAreas.includes(normalized)) return CUSTOM_LAKE_AREA_OPTION;
  return CUSTOM_LAKE_AREA_OPTION;
}

const legacyMarineAreaNames = new Set([
  "Suomenlahti",
  "Saaristomeri",
  "Selkämeri",
  "Perämeri",
  "Ahvenanmeri",
  "Merenkurkku",
  "Saaristomeri / Ahvenanmeri",
  "Selkämeri / Merenkurkku",
  "Merialue (muu)",
]);

function getOfficialMarineArea(area) {
  const normalized = String(area || "").trim();
  if (normalized === "Saaristomeri" || normalized === "Ahvenanmeri" || normalized === "Saaristomeri / Ahvenanmeri") {
    return officialMarineAreas.find((item) => item.icesSubdivision === "29") || null;
  }
  if (normalized === "Selkämeri" || normalized === "Merenkurkku" || normalized === "Selkämeri / Merenkurkku") {
    return officialMarineAreas.find((item) => item.icesSubdivision === "30") || null;
  }
  if (normalized === "Perämeri") return officialMarineAreas.find((item) => item.icesSubdivision === "31") || null;
  if (normalized === "Suomenlahti") return officialMarineAreas.find((item) => item.icesSubdivision === "32") || null;
  return null;
}

function isMarineCatchForm(form, areaSelector = "") {
  if (areaSelector === CUSTOM_SEA_AREA_OPTION) return true;
  if (areaSelector === CUSTOM_LAKE_AREA_OPTION) return false;
  if (getOfficialMarineArea(areaSelector) || legacyMarineAreaNames.has(String(form?.area || "").trim())) return true;
  return !areaSelector && String(form?.waterType || "").trim() === WATER_TYPE_SEA;
}

function getMarineGearByCode(code) {
  return marineGearTypes.find((item) => item.code === String(code || "").trim()) || null;
}

function createFishingDayId({ date, sourceIdentifier }) {
  const source = formatBatchSourceIdentifier(sourceIdentifier) || "ILMANALUSTA";
  return `FD-${formatBatchDate(date)}-${source}`;
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

const OFFICIAL_CATCH_PROCESSED_SPECIES_PATTERN = /\b(filee|filet|avattu|perattu|päätön|nyljetty)\b/i;

function isEligibleForOfficialCatchReport(entry) {
  return !OFFICIAL_CATCH_PROCESSED_SPECIES_PATTERN.test(String(entry?.species || ""));
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
  if (gear === "Trooli" || gear === "Paritrooli" || gear === "Hoitokalastus troolilla") return "Trooli";
  if (gear.startsWith("Nuotta")) return "Nuotta";
  if (gear === "Muikkuverkko" || gear.startsWith("Verkko") || gear === "Verkko") return "Verkko";
  if (gear.startsWith("Rysä / paunetti") || gear === "Rysä" || gear === "Paunetti / avorysä" || gear === "Paunetti/avorysä") return "Rysä";
  if (gear === "Katiska") return "Katiska";
  if (gear === "Merta" || gear === "Merrat") return "Merta";
  if (gear === "Vapapyydys tai vetouistin" || gear === "Vapaväline") return "Vapaväline";
  if (gear === "Muu pyydys" || gear === "Muu") return "Muu";
  return gear;
}

function catchGearUsesCount(gearValue) {
  return Boolean(getInlandGearMeta(gearValue)) || normalizeCatchGearValue(gearValue) !== "Trooli";
}

function getFishingDurationFieldMeta(gearValue) {
  const inlandGear = getInlandGearMeta(gearValue);
  if (inlandGear?.effort === "time") {
    if (inlandGear.secondaryField === "speed") {
      return {
        label: "Pyyntiaika ja vetonopeus",
        durationLabel: "Pyyntiaika (hh:mm)",
        speedLabel: "Vetonopeus (km/h)",
        durationPlaceholder: "Esim. 4:20",
        speedPlaceholder: "Esim. 4",
        help: "Ilmoita pyyntiaika tunteina ja minuutteina sekä vetonopeus kilometreinä tunnissa.",
        splitFields: true,
      };
    }
    if (inlandGear.secondaryField === "haulLength") {
      return {
        label: "Pyyntiaika ja vedon pituus",
        durationLabel: "Pyyntiaika (hh:mm)",
        speedLabel: "Vedon pituus (m)",
        durationPlaceholder: "Esim. 6:30",
        speedPlaceholder: "Esim. 500",
        help: "Ilmoita pyyntiaika tunteina ja minuutteina sekä vedon pituus metreinä.",
        splitFields: true,
      };
    }
    return {
      label: "Pyyntiaika (hh:mm)",
      placeholder: "Esim. 4:20",
      help: "Ilmoita pyyntiaika tunteina ja minuutteina.",
      splitFields: false,
    };
  }
  if (inlandGear?.effort === "days") {
    return {
      label: "Pyyntipäiviä edellisestä koennasta",
      placeholder: "Esim. 2",
      help: "Ilmoita pyydyksen pyyntipäivien määrä edellisestä koennasta.",
      splitFields: false,
    };
  }

  const normalizedGear = normalizeCatchGearValue(gearValue);
  const gear = String(gearValue || "").trim();

  if (normalizedGear === "Trooli") {
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
      speedPlaceholder: "Esim. 4",
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
  const vesselIssue = getFishingVesselValidationIssue(form);
  const catchYear = Number(String(form?.date || "").slice(0, 4));
  const currentYear = new Date().getFullYear();

  if (vesselIssue) {
    issues.push(vesselIssue);
  }
  if (!String(form?.date || "").trim()) {
    issues.push("Kalastuspäivä puuttuu.");
  } else if (!Number.isInteger(catchYear) || catchYear < currentYear - 1 || catchYear > currentYear) {
    issues.push("Sisävesisaalis voidaan ilmoittaa vain kuluvalle tai edelliselle vuodelle.");
  }

  if (!String(form?.area || "").trim()) {
    issues.push("Kalastamisalue puuttuu.");
  }
  if (!String(form?.municipality || "").trim()) {
    issues.push("Paikkakunta puuttuu.");
  }
  if (!String(form?.landingPlace || "").trim()) {
    issues.push("Purkamispaikka puuttuu.");
  }
  issues.push(...getInlandGearValidationIssues(form));

  return issues;
}

function validateOfficialCatchEntries(entries = []) {
  const issues = [];

  entries.forEach((entry) => {
    const identifier = String(entry?.batchId || entry?.batch_id || entry?.id || "").trim() || "tuntematon erä";
    const missing = [];
    if (!String(entry?.date || "").trim()) missing.push("kalastuspäivä");
    if (!String(entry?.area || "").trim()) missing.push("kalastamisalue");
    if (!String(entry?.municipality || "").trim()) missing.push("paikkakunta");
    if (!String(entry?.landingPlace || "").trim()) missing.push("purkamispaikka");
    if (!entry?.fishingWithoutVessel && !String(entry?.commercialFishingVesselId || "").trim()) missing.push("alus tai Kalastus ilman alusta -valinta");

    const gearIssues = getInlandGearValidationIssues({
      ...entry,
      inlandGearCode: entry?.inlandGearCode || entry?.inland_gear_code || "",
      gearCount: entry?.gearCount || entry?.gear_count || "",
      fishingDurationDays: entry?.fishingDurationDays || entry?.fishing_effort || "",
      fishingSecondaryValue: entry?.fishingSecondaryValue || entry?.fishing_secondary_value || "",
      netMeshSize: entry?.netMeshSize || entry?.gear_mesh_size || "",
      netHeight: entry?.netHeight || entry?.gear_height || "",
      gearLength: entry?.gearLength || entry?.gear_length || "",
      gearWidth: entry?.gearWidth || entry?.gear_width || "",
      otherGearName: entry?.otherGearName || entry?.other_gear_name || "",
    });
    missing.push(...gearIssues.map((issue) => issue.replace(/\.$/, "").toLocaleLowerCase("fi-FI")));

    if (!entry?.effortOnly && isInlandDualQuantitySpecies(entry?.species) && (Number(entry?.kilos || 0) <= 0 || Number(entry?.count || 0) <= 0)) {
      missing.push("lajilta vaaditaan sekä kilot että kappaleet");
    }

    if (missing.length > 0) {
      issues.push(`${identifier}: ${missing.join(", ")}`);
    }
  });

  return issues;
}

function validateMarineCatchForm(form) {
  const issues = [];
  const vesselIssue = getFishingVesselValidationIssue(form);
  if (vesselIssue) issues.push(vesselIssue);
  if (!String(form?.area || "").trim()) issues.push("Merialue puuttuu.");
  if (!String(form?.icesSubdivision || "").trim()) issues.push("ICES-osa-alue puuttuu.");
  if (!String(form?.statisticalRectangle || "").trim()) issues.push("Tilastoruutu puuttuu.");
  if (!String(form?.marineGearCode || "").trim()) issues.push("Merialueen pyydys puuttuu.");
  if (!String(form?.landingPlace || "").trim()) issues.push("Purkamispaikka puuttuu.");
  if (!String(form?.vesselLengthClass || "").trim()) issues.push("Aluksen pituusluokka puuttuu.");
  if (form?.vesselLengthClass === "under_10m" || form?.vesselLengthClass === "without_vessel") {
    issues.push(...getCoastalEffortValidationIssues({
      gearCount: form?.gearCount,
      fishingDays: form?.fishingDurationDays,
      fishingHours: form?.fishingSecondaryValue,
      marineGearCode: form?.marineGearCode,
    }));
  }
  return issues;
}

function validateCoastalCatchEntries(entries = []) {
  const issues = [];
  entries.forEach((entry) => {
    const identifier = String(entry?.batchId || entry?.id || "tuntematon erä");
    const missing = [];
    if (!entry?.date) missing.push("pyyntipäivä");
    if (!entry?.icesSubdivision) missing.push("ICES-osa-alue");
    if (!entry?.statisticalRectangle) missing.push("tilastoruutu");
    if (!entry?.marineGearCode) missing.push("meripyydyskoodi");
    if (!entry?.landingPlace) missing.push("purkamispaikka");
    if (!entry?.vesselLengthClass) missing.push("aluksen pituusluokka");
    if (entry?.vesselLengthClass === "under_10m" && !entry?.commercialFishingVesselId) missing.push("aluksen rekisteritunnus");
    if (!getSpeciesMetadata(entry?.species)?.fao) missing.push("vahvistettu FAO-lajikoodi");
    if (!isCoastalReportSpeciesAllowed(entry?.species)) missing.push("lohi ja turska ilmoitetaan purkamisilmoituksella");
    missing.push(...getCoastalEffortValidationIssues({
      gearCount: entry?.gearCount || entry?.gear_count || "",
      fishingDays: entry?.fishingDurationDays || entry?.fishing_effort || "",
      fishingHours: entry?.fishingSecondaryValue || entry?.fishing_secondary_value || "",
      marineGearCode: entry?.marineGearCode || entry?.marine_gear_code || "",
    }).map((issue) => issue.replace(/\.$/, "").toLocaleLowerCase("fi-FI")));
    if (missing.length > 0) issues.push(`${identifier}: ${missing.join(", ")}`);
  });
  return issues;
}

function buildCoastalCatchWorkbook(entries = [], reportDateLabel = "kaikki", fisherProfile = null, reportingDetails = {}) {
  const coastalEntries = entries.filter((entry) => String(entry?.waterType || "") === WATER_TYPE_SEA);
  const buyers = Array.isArray(reportingDetails?.buyers) ? reportingDetails.buyers : [];
  const grouped = new Map();

  coastalEntries.forEach((entry) => {
    const speciesMeta = getSpeciesMetadata(entry?.species);
    const month = String(entry?.date || "").slice(0, 7);
    const key = [
      month,
      entry?.commercialFishingVesselId || "ilman alusta",
      entry?.icesSubdivision || "",
      entry?.statisticalRectangle || "",
      entry?.marineGearCode || "",
      entry?.landingPlace || "",
      entry?.gearCount || entry?.gear_count || "",
      speciesMeta?.fao || "",
    ].join("|");
    const current = grouped.get(key) || {
      month,
      vessel: entry?.commercialFishingVesselId || "Kalastus ilman alusta",
      vesselLengthClass: entry?.vesselLengthClass || "",
      icesSubdivision: entry?.icesSubdivision || "",
      statisticalRectangle: entry?.statisticalRectangle || "",
      marineGearCode: entry?.marineGearCode || "",
      marineGearName: entry?.marineGearName || getMarineGearByCode(entry?.marineGearCode)?.name || "",
      traceabilityCategory: getMarineGearByCode(entry?.marineGearCode)?.traceabilityCategory || "",
      landingPlace: entry?.landingPlace || "",
      gearCount: entry?.gearCount || entry?.gear_count || "",
      species: formatSpeciesForLabelTitle(entry?.species || ""),
      scientificName: speciesMeta?.scientific || "",
      faoCode: speciesMeta?.fao || "",
      kilos: 0,
      fishingDays: 0,
      fishingHoursTotal: 0,
      fishingHoursCount: 0,
      effortKeys: new Set(),
      dates: new Set(),
      batchIds: new Set(),
      fishingDayIds: new Set(),
      releasedCatchDetails: new Set(),
      incidentalBycatchDetails: new Set(),
      lostGearDetails: new Set(),
    };
    current.kilos += Number(entry?.kilos || 0);
    const effortKey = String(entry?.batchId || entry?.id || `${entry?.date || ""}|${current.effortKeys.size}`);
    if (!current.effortKeys.has(effortKey)) {
      const fishingDays = parseLocaleNumber(entry?.fishingDurationDays || entry?.fishing_effort);
      const fishingHours = parseLocaleNumber(entry?.fishingSecondaryValue || entry?.fishing_secondary_value);
      if (fishingDays != null) current.fishingDays += fishingDays;
      if (fishingHours != null) {
        current.fishingHoursTotal += fishingHours;
        current.fishingHoursCount += 1;
      }
      current.effortKeys.add(effortKey);
    }
    if (entry?.date) current.dates.add(entry.date);
    if (entry?.batchId) current.batchIds.add(entry.batchId);
    if (entry?.fishingDayId) current.fishingDayIds.add(entry.fishingDayId);
    if (entry?.releasedCatchDetails) current.releasedCatchDetails.add(entry.releasedCatchDetails);
    if (entry?.incidentalBycatchDetails) current.incidentalBycatchDetails.add(entry.incidentalBycatchDetails);
    if (entry?.lostGearDetails) current.lostGearDetails.add(entry.lostGearDetails);
    grouped.set(key, current);
  });

  const instructions = [
    ["Rannikkokalastuksen saalisilmoitus"],
    ["Valittu aikaväli", reportDateLabel],
    ["Huomio", "Raportti sisältää sovellukseen kirjatut rannikkokalastuksen saalistiedot valitulta aikaväliltä. Tarkista tiedot ennen toimittamista."],
    ["Rajaus", "Alle 10 metrin alusten ja ilman alusta kalastettujen merisaaliiden kuukausikooste."],
    [],
    ["Kalastaja", fisherProfile?.display_name || ""],
    ["Yritys", fisherProfile?.company_name || ""],
    ["Y-tunnus", fisherProfile?.business_id || ""],
    ["Kaupallisen kalastajan tunnus", fisherProfile?.commercial_fishing_id || ""],
  ];

  const rows = [[
    "Kuukausi",
    "Alus / ilman alusta",
    "Aluksen pituusluokka",
    "ICES-osa-alue",
    "Tilastoruutu",
    "Pyydyskoodi",
    "Pyydys",
    "Jäljitettävyysryhmä",
    "Pyydysten lkm",
    "Pyyntipäiviä",
    "Keskimääräinen kalastusaika h",
    "Pääasiallinen purkamispaikka",
    "Laji",
    "Tieteellinen nimi",
    "FAO-koodi",
    "Purettu saalis kg",
    "Vapautettu / poisheitetty saalis",
    "Tahattomat sivusaaliit",
    "Kadonneet / tuhoutuneet pyydykset",
    "Kalastuspäivätunnukset",
    "Jäljitettävyystunnukset",
  ]];

  Array.from(grouped.values())
    .sort((left, right) => `${left.month}|${left.vessel}|${left.faoCode}`.localeCompare(`${right.month}|${right.vessel}|${right.faoCode}`))
    .forEach((item) => rows.push([
      item.month,
      item.vessel,
      item.vesselLengthClass === "under_10m" ? "Alle 10 m" : item.vesselLengthClass === "without_vessel" ? "Ilman alusta" : "Vähintään 10 m",
      item.icesSubdivision,
      item.statisticalRectangle,
      item.marineGearCode,
      item.marineGearName,
      item.traceabilityCategory,
      item.gearCount,
      item.fishingDays,
      item.fishingHoursCount > 0 ? item.fishingHoursTotal / item.fishingHoursCount : "",
      item.landingPlace,
      item.species,
      item.scientificName,
      item.faoCode,
      item.kilos,
      Array.from(item.releasedCatchDetails).join("; "),
      Array.from(item.incidentalBycatchDetails).join("; "),
      Array.from(item.lostGearDetails).join("; "),
      Array.from(item.fishingDayIds).join(", "),
      Array.from(item.batchIds).join(", "),
    ]));

  const buyerRows = [[
    "Ostajan yritys / nimi",
    "Yhteyshenkilö",
    "Sähköposti",
    "Puhelin",
    "Lähde",
  ]];
  buyers.forEach((buyer) => buyerRows.push([
    buyer.companyName || "",
    buyer.contactName || "",
    buyer.email || "",
    buyer.phone || "",
    buyer.source === "manual" ? "Lisätty ilmoitusta muodostettaessa" : "Sovelluksessa toteutunut kauppa",
  ]));

  return [
    { name: "Ohjeet", rows: instructions },
    { name: "Rannikkoilmoitus", rows },
    { name: "Ostajat", rows: buyerRows },
  ];
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

  const packagingLine = String(source?.packaging || "").trim()
    ? `Pakkaustapa: ${String(source.packaging).trim()}`
    : "";
  const baseNotes = [String(notes || "").trim(), packagingLine].filter(Boolean).join("\n");
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
  12: "Merrat",
  13: "Muu pyydys",
  14: "Hoitokalastus troolilla",
  15: "Hoitokalastus nuotalla",
  16: "Hoitokalastus rysällä, paunetilla, merralla ja katiskalla",
  17: "Hoitokalastus muulla pyydyksellä",
  18: "Vapapyydys tai vetouistin",
  19: "Paritrooli",
  20: "Nuotta",
  21: "Verkko",
  22: "Rysä",
  23: "Paunetti / avorysä",
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
  const currentInlandCode = String(entry?.inlandGearCode || entry?.inland_gear_code || getInlandGearCode(gear)).trim();
  if (!gear) {
    return {
      code: "",
      label: "-",
      note: "Pyydys puuttuu",
    };
  }

  if (currentInlandCode && OFFICIAL_GEAR_CODE_NOTES[currentInlandCode]) {
    return {
      code: currentInlandCode,
      label: OFFICIAL_GEAR_CODE_NOTES[currentInlandCode],
      note: entry?.inlandGearCode || entry?.inland_gear_code ? "" : "Pyydyskoodi pääteltiin vanhasta pyydysnimestä.",
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

function buildOfficialCatchWorkbook(entries = [], reportDateLabel = "kaikki", fisherProfile = null, reportSpotLabel = "") {
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
    ...(reportSpotLabel ? [["Tarkempi pyyntipaikka", reportSpotLabel]] : []),
    [],
    ...fisherInfoRows,
    ["Huomiot"],
    ["- Saalis ilmoitetaan pyyntipäivittäin, kalastamisalueittain ja pyydyksittäin."],
    ["- Saaliskilot ilmoitetaan kokonaislukuina virallisen ohjeen mukaisesti."],
    ["- Viralliseen raporttiin otetaan vain kokonaisina kirjatut kalat. Peratut, avatut, fileoidut, päättömät ja nyljetyt tuote-erät jätetään pois, jotta sama saalis ei tule ilmoitetuksi kahdesti."],
    ["- Ravuille, nahkiaiselle ja lohelle ilmoitetaan sekä kilot että kappaleet."],
    ["- Hoitokalastus ilmoitetaan erillisenä kyllä/ei-tietona käytetyn pyydyksen lisäksi."],
    ["- Jos pyydyskoodia ei voitu päätellä varmasti, Huomio viralliseen ilmoitukseen -sarakkeessa kerrotaan miksi."],
    [],
    ["Pyydyskoodisto"],
    ["Koodi", "Selite"],
    ...["1", "11", "12", "13", "18", "19", "20", "21", "22", "23"].map((code) => [code, OFFICIAL_GEAR_CODE_NOTES[code]]),
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
      "Hoitokalastus",
      "Vain pyyntiponnistus",
      "Pyydysten määrä",
      "Pyyntiaika / pyyntipäivät",
      "Vetonopeus / vedon pituus",
      "Solmuväli (mm)",
      "Korkeus (m)",
      "Pituus (m)",
      "Leveys (m)",
      "Verkkojen kokonaispituus (m)",
      "Muu pyydys, mikä",
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
      const gearLength = Number(entry?.gearLength || entry?.gear_length || 0);
      const gearCount = Number(entry?.gearCount || entry?.gear_count || 0);
      const effortOnly = Boolean(entry?.effortOnly || entry?.effort_only);

      return [
        entry?.date || "",
        vesselLabel,
        areaNumberMap.get(areaLabel) || "",
        areaLabel || "-",
        gearInfo.code || "",
        String(entry?.gear || "").trim() || "-",
        entry?.managementFishing || entry?.management_fishing ? "Kyllä" : "Ei",
        effortOnly ? "Kyllä" : "Ei",
        String(entry?.gearCount || "").trim() || "",
        String(entry?.fishingDurationDays || "").trim() || "",
        String(entry?.fishingSecondaryValue || entry?.fishing_secondary_value || "").trim(),
        String(entry?.netMeshSize || entry?.gear_mesh_size || "").trim(),
        String(entry?.netHeight || entry?.gear_height || "").trim(),
        String(entry?.gearLength || entry?.gear_length || "").trim(),
        String(entry?.gearWidth || entry?.gear_width || "").trim(),
        gearInfo.code === "21" && gearLength > 0 && gearCount > 0 ? gearLength * gearCount : "",
        String(entry?.otherGearName || entry?.other_gear_name || "").trim(),
        landingNumberMap.get(landingLabel) || "",
        landingLabel || "-",
        effortOnly ? "Ei saalista" : (isOtherSpecies ? "Muu laji" : speciesLabel),
        otherSpeciesDetail,
        effortOnly ? "" : toWholeKilo(kilos),
        effortOnly ? "" : kilos,
        !effortOnly && isInlandDualQuantitySpecies(entry?.species) && count > 0 ? count : "",
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
    { name: "Nuotta on pyydyslistassa", pass: gearTypes.includes("Nuotta") },
    { name: "Merrat on pyydyslistassa", pass: gearTypes.includes("Merrat") },
    { name: "Paritrooli on pyydyslistassa", pass: gearTypes.includes("Paritrooli") },
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

function CatchLabelPrintModal({ entry, profile, labelCount, setLabelCount, pieceCount, setPieceCount, weightKg, setWeightKg, productForm, setProductForm, useByDate, setUseByDate, printFormat, setPrintFormat, waterType, setWaterType, onClose, onGeneratePdf, onPrint, viewportWidth }) {
  if (!entry) return null;

  const previewLabel = {
    ...buildCatchLabelData(entry, profile, 1, Math.max(1, Number(labelCount || 1)), { waterType, pieceCount, weightKg, productForm, useByDate }),
    qrImageUrl: getCatchLabelQrImageUrl(buildCatchLabelData(entry, profile, 1, Math.max(1, Number(labelCount || 1)), { waterType, pieceCount, weightKg, productForm, useByDate })),
    logoUrl: getAppLogoUrl(),
  };
  const isMobile = viewportWidth < 768;
  const isIosMobileApp = isMobile && isNativeIosApp();
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
    pieceCount: isCrayfishSpecies(entry.species) ? String(pieceCount || "").trim() : "",
    weightKg: !isCrayfishSpecies(entry.species) ? String(weightKg || "").trim() : "",
    productForm: isCrayfishSpecies(entry.species) ? "" : String(productForm || "").trim(),
    useByDate: String(useByDate || "").trim(),
  }), [entry, labelCount, pieceCount, printFormat, productForm, useByDate, waterType, weightKg]);

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(15, 23, 42, 0.45)",
      display: "flex",
      alignItems: isMobile ? "stretch" : "center",
      justifyContent: "center",
      padding: isMobile ? (isIosMobileApp ? "64px 8px 20px" : 8) : 20,
      boxSizing: "border-box",
      zIndex: 2000,
    }} onClick={onClose}>
      <div style={{
        ...styles.card,
        width: isMobile ? "calc(100vw - 16px)" : "min(980px, 100%)",
        maxHeight: isMobile ? (isIosMobileApp ? "calc(100dvh - 84px)" : "calc(100dvh - 16px)") : "90vh",
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
            {!isCrayfishSpecies(entry.species) ? (
              <div style={styles.field}>
                <label>Tuotemuoto</label>
                <select style={styles.input} value={productForm} onChange={(e) => setProductForm(e.target.value)}>
                  {CATCH_LABEL_PRODUCT_FORMS.map((value) => (
                    <option key={value || "whole"} value={value}>{value || "Kokonainen"}</option>
                  ))}
                </select>
              </div>
            ) : null}
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
            {isCrayfishSpecies(entry.species) ? (
              <div style={styles.field}>
                <label>Etikettiin tuleva kpl-määrä (valinnainen)</label>
                <input
                  style={styles.input}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="Jätä tyhjäksi käsin täyttämistä varten"
                  value={pieceCount}
                  onChange={(e) => setPieceCount(e.target.value.replace(/\D/g, ""))}
                />
                <div style={styles.small}>Jos jätät kentän tyhjäksi, etikettiin tulostuu kpl-kohta ja viiva käsin kirjoittamista varten.</div>
              </div>
            ) : (
              <div style={styles.field}>
                <label>Etikettiin tuleva paino kg (valinnainen)</label>
                <input
                  style={styles.input}
                  type="text"
                  inputMode="decimal"
                  placeholder="Esim. 10"
                  value={weightKg}
                  onChange={(e) => {
                    const nextValue = e.target.value.replace(".", ",").replace(/[^0-9,]/g, "");
                    const [whole = "", ...decimalParts] = nextValue.split(",");
                    setWeightKg(decimalParts.length ? `${whole},${decimalParts.join("")}` : whole);
                  }}
                />
                <div style={styles.small}>Jos jätät kentän tyhjäksi, etikettiin tulostuu painokohta ja viiva käsin kirjoittamista varten.</div>
              </div>
            )}
            <div style={styles.field}>
              <label>Viimeinen käyttöpäivä (valinnainen)</label>
              <input style={{ ...styles.input, ...styles.dateInput }} type="date" value={useByDate} onChange={(e) => setUseByDate(e.target.value)} />
              <div style={styles.small}>Jos jätät kentän tyhjäksi, viimeistä käyttöpäivää ei tulosteta etikettiin.</div>
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
                        <div style={{ marginTop: 8, fontSize: Math.min(14, (14 * 27) / Math.max(`Erätunnus: ${previewLabel.batchId}`.length, 1)), fontWeight: 800, padding: "6px 8px", background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: 8, whiteSpace: "nowrap", letterSpacing: "-0.02em", overflow: "hidden" }}>Erätunnus: {previewLabel.batchId}</div>
                        {previewLabel.catchArea ? <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.12 }}>Pyyntialue: {previewLabel.catchArea}</div> : null}
                        {previewLabel.harvestSourceText ? <div style={{ fontSize: 12, lineHeight: 1.12 }}>{previewLabel.harvestSourceText}</div> : null}
                        {previewLabel.gearType ? <div style={{ fontSize: 12, lineHeight: 1.12 }}>Pyyntimenetelmä: {previewLabel.gearType}</div> : null}
                        {previewLabel.productStateText ? <div style={{ fontSize: 12, lineHeight: 1.12 }}>{previewLabel.productStateText}</div> : null}
                        {previewLabel.catchDate ? <div style={{ fontSize: 14, lineHeight: 1.16, fontWeight: 700 }}>Pyyntipäivä: {previewLabel.catchDate}</div> : null}
                        {previewLabel.useByDate ? <div style={{ fontSize: 14, lineHeight: 1.16, fontWeight: 700 }}>Viimeinen käyttöpäivä: {previewLabel.useByDate}</div> : null}
                        {previewLabel.commercialFishingId ? <div style={{ fontSize: 12, lineHeight: 1.12 }}>Kaupallisen kalastajan tunnus: {previewLabel.commercialFishingId}</div> : null}
                        <div style={{ fontSize: 12, lineHeight: 1.12 }}>Säilytys: {previewLabel.storageText}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginTop: 12, minHeight: 24 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{previewLabel.isCrayfish ? "Kpl:" : "Paino:"}</span>
                        {(previewLabel.isCrayfish ? previewLabel.pieceCount : previewLabel.weightKg) ? (
                          <span style={{ flex: 1, fontSize: 12, fontWeight: 700 }}>{previewLabel.isCrayfish ? previewLabel.pieceCount : previewLabel.weightKg}</span>
                        ) : (
                          <span style={{ flex: 1, borderBottom: "2px solid #0f172a", height: 18 }} />
                        )}
                        <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{previewLabel.isCrayfish ? "kpl" : "kg"}</span>
                      </div>
                      <div style={{ marginTop: "auto", fontSize: 12, lineHeight: 1.12 }}>
                        <div>Toimittaja: {previewLabel.supplier}</div>
                        {previewLabel.supplierAddress ? <div>{previewLabel.supplierAddress}</div> : null}
                        {previewLabel.supplierContact ? <div>{previewLabel.supplierContact}</div> : null}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, paddingTop: 4 }}>
                        {previewLabel.eviraFacilityId ? (
                          <FacilityOvalPreview value={previewLabel.eviraFacilityId} width={40} minHeight={30} fontSize={7} />
                        ) : null}
                        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
                          <img src={previewLabel.logoUrl} alt="Suoraan Kalastajalta" style={{ width: previewLabel.eviraFacilityId ? 38 : 48, height: previewLabel.eviraFacilityId ? 38 : 48, objectFit: "contain", marginBottom: 0 }} />
                          <div style={{ fontSize: previewLabel.eviraFacilityId ? 8 : 10, lineHeight: 1.05, fontWeight: 700, textAlign: "center", color: "#0f172a" }}>
                            <div>Suoraan</div>
                            <div>Kalastajalta</div>
                          </div>
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

function getHeaderBrandStyles(viewportWidth) {
  const compact = viewportWidth < 560;
  return {
    row: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: compact ? 12 : 2,
      flexWrap: "nowrap",
      width: "100%",
      marginTop: compact ? 0 : 12,
      marginBottom: compact ? 8 : 12,
      minWidth: 0,
    },
    title: {
      ...styles.title,
      marginRight: compact ? 0 : -2,
      minWidth: 0,
      flex: "1 1 auto",
      width: "auto",
      fontSize: compact ? "clamp(27px, 8vw, 34px)" : styles.title.fontSize,
      lineHeight: compact ? 1.02 : styles.title.lineHeight,
    },
    logo: {
      height: compact ? "auto" : viewportWidth < 768 ? 116 : viewportWidth < 1024 ? 170 : 196,
      width: compact ? 86 : "auto",
      maxWidth: compact ? 86 : viewportWidth < 768 ? "36vw" : "none",
      objectFit: "contain",
      display: "block",
      flex: "0 0 auto",
    },
  };
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
  onCreateDeliveryNote,
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
      if (isAuctionTradeOffer(offer)) return false;
      if (!entry.batchId) return false;
      if (offer.batch_id && offer.batch_id === entry.batchId) return true;
      return getOfferSummaryBatchItems(offer.species_summary).some((item) => item.batchId === entry.batchId);
    });

    const entryMatches = (buyerOffers || []).filter((offer) => {
      if (isAuctionTradeOffer(offer)) return false;
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
    .filter((offer) => !isAuctionTradeOffer(offer))
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
        onCreateDeliveryNote={onCreateDeliveryNote}
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
        onCreateDeliveryNote={onCreateDeliveryNote}
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
  const [reportSpotFilter, setReportSpotFilter] = useState("");
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
  const normalizedReportSpotFilter = String(reportSpotFilter || "").trim().toLowerCase();
  const reportSpotLabel = String(reportSpotFilter || "").trim();
  const reportScopeLabel = [reportDateLabel, reportSpotLabel ? `pyyntipaikka: ${reportSpotLabel}` : ""]
    .filter(Boolean)
    .join(" · ");
  const reportDateGridStyle = {
    ...styles.grid2,
    gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))",
  };

  const isWithinReportRange = (value) => {
    const normalizedValue = String(value || "").trim().slice(0, 10);
    if (!normalizedValue) return !reportStartDate && !reportEndDate;
    if (reportStartDate && normalizedValue < reportStartDate) return false;
    if (reportEndDate && normalizedValue > reportEndDate) return false;
    return true;
  };

  const matchesReportSpot = (entryLike) => {
    if (!normalizedReportSpotFilter) return true;
    return String(entryLike?.spot || "").trim().toLowerCase() === normalizedReportSpotFilter;
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
      dateRangeLabel: reportScopeLabel,
      reportOwnerName: String(profile?.display_name || profile?.company_name || "").trim(),
      reportOwnerCompany: String(profile?.company_name || "").trim(),
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
                style={{ ...styles.input, ...styles.dateInput }}
                type="date"
                value={reportStartDate}
                onChange={(e) => setReportStartDate(e.target.value)}
                max={reportEndDate || undefined}
              />
            </div>
            <div style={styles.field}>
              <label>Loppupäivä</label>
              <input
                style={{ ...styles.input, ...styles.dateInput }}
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

  const reportSpotOptions = useMemo(
    () => Array.from(new Set(entries.map((entry) => String(entry?.spot || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "fi")),
    [entries],
  );

  const filteredEntries = entries.filter((entry) => isWithinReportRange(entry.date) && matchesReportSpot(entry));
  const freeCatchReportHeader = ["Pvm", "Kalalaji", "Määrä", "Pyyntiväline", "Tarkempi pyyntipaikka"];
  const freeCatchReportBody = filteredEntries.map((entry) => {
    const normalized = normalizeFishSpeciesLabel(entry.species);
    const speciesLabel = fishSpeciesByName[normalized]?.name_fi || String(entry.species || "").split(",")[0].trim() || "Muu";
    const kilos = Number(entry.kilos || 0);
    const count = Number(entry.count || 0);
    const quantityLabel = isCrayfishSpecies(speciesLabel)
      ? `${count.toLocaleString("fi-FI")} kpl${kilos > 0 ? ` (${kilos.toLocaleString("fi-FI")} kg)` : ""}`
      : `${kilos.toLocaleString("fi-FI")} kg${count > 0 ? ` (${count.toLocaleString("fi-FI")} kpl/kg)` : ""}`;

    return [
      entry.date || "",
      speciesLabel,
      quantityLabel,
      formatCatchGearDisplay(entry),
      entry.spot || "",
    ];
  });
  const freeCatchReportRows = [freeCatchReportHeader, ...freeCatchReportBody];

  if (profile?.role === "member" && !hasFisherPremium) {
    return (
      <div style={styles.stack}>
        <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
          <div style={styles.rowBetween}>
            <strong>Raportit</strong>
            <div style={styles.muted}>Valittu rajaus: {reportScopeLabel}</div>
          </div>
          <div style={reportDateGridStyle}>
            <div style={styles.field}>
              <label>Alkupäivä</label>
              <input
                style={{ ...styles.input, ...styles.dateInput }}
                type="date"
                value={reportStartDate}
                onChange={(e) => setReportStartDate(e.target.value)}
                max={reportEndDate || undefined}
              />
            </div>
            <div style={styles.field}>
              <label>Loppupäivä</label>
              <input
                style={{ ...styles.input, ...styles.dateInput }}
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
          <div style={styles.field}>
            <label>Tarkempi pyyntipaikka raportille</label>
            <RememberedTextInput
              value={reportSpotFilter}
              onChange={(e) => setReportSpotFilter(e.target.value)}
              options={reportSpotOptions}
              placeholder="Esim. osakaskunnan nimi"
              listId="report-spot-options-free"
            />
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
  const filteredOffers = offers.filter((offer) => isWithinReportRange(offer.created_at) && matchesReportSpot(offer));

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
        spotLabel: entry.spot || "",
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
    "Tarkempi pyyntipaikka",
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
    session.spotLabel,
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
  const officialCatchEntries = filteredEntries.filter(isEligibleForOfficialCatchReport);
  const inlandOfficialEntries = officialCatchEntries.filter((entry) => String(entry?.waterType || "") !== WATER_TYPE_SEA);
  const coastalReportEntries = filteredEntries.filter((entry) => (
    isEligibleForOfficialCatchReport(entry)
    &&
    String(entry?.waterType || "") === WATER_TYPE_SEA
    && (entry?.vesselLengthClass === "under_10m" || entry?.vesselLengthClass === "without_vessel")
  ));
  const coastalBatchIds = new Set(coastalReportEntries.map((entry) => String(entry?.batchId || "").trim()).filter(Boolean));
  const automaticCoastalBuyers = Array.from((offers || []).reduce((buyersByKey, offer) => {
    const offerBatchId = String(offer?.batch_id || offer?.batchId || "").trim();
    if (String(offer?.status || "") !== "accepted" || !coastalBatchIds.has(offerBatchId)) return buyersByKey;
    const companyName = String(offer?.buyer_company_name || offer?.company_name || offer?.buyer_contact_name || offer?.contact_name || "").trim();
    const contactName = String(offer?.buyer_contact_name || offer?.contact_name || "").trim();
    const email = normalizeEmail(offer?.buyer_email || offer?.contact_email || offer?.buyer_billing_email || "");
    const phone = String(offer?.buyer_phone || offer?.contact_phone || "").trim();
    const key = [companyName.toLowerCase(), email, phone].join("|");
    if (!key.replaceAll("|", "")) return buyersByKey;
    if (!buyersByKey.has(key)) {
      buyersByKey.set(key, { companyName, contactName, email, phone, source: "automatic" });
    }
    return buyersByKey;
  }, new Map()).values());
  const officialCatchWorkbook = buildOfficialCatchWorkbook(inlandOfficialEntries, reportDateLabel, profile, reportSpotLabel);
  const officialCatchIssues = validateOfficialCatchEntries(inlandOfficialEntries);
  const coastalCatchIssues = validateCoastalCatchEntries(coastalReportEntries);
  const coastalCatchWorkbook = buildCoastalCatchWorkbook(
    coastalReportEntries,
    reportDateLabel,
    profile,
    { buyers: automaticCoastalBuyers },
  );
  const offerReportRows = [["Pvm", "Yritys", "Yhteyshenkilö", "Sähköposti", "Puhelin", "Tarjous €/kg", "Tila", "Viesti"], ...offerRows];
  const processedReportRows = [["Tuotantopäivä", "Kirjaaja", "Vesialue", "Paikkakunta", "Tuotenimi", "Tuotetyyppi", "Käsittely", "Lajiyhteenveto", "Kg", "Pakkauskoko g", "Pakkausten määrä", "Parasta ennen", "Toimitustapa", "Toimitusalue", "Toimituskustannus €", "Aikaisin toimitus", "Kylmäkuljetus", "Lisätiedot"], ...processedRows];

  return (
    <div style={styles.stack}>
      <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
        <strong>Excel-raportit</strong>
        <div style={styles.noticeInfo}>Valitse raportille aikaväli. Voit ladata Excelin tai lähettää sen sähköpostiin liitetiedostona.</div>
        <div style={reportDateGridStyle}>
          <div style={styles.field}>
            <label>Alkupäivä</label>
            <input
              style={{ ...styles.input, ...styles.dateInput }}
              type="date"
              value={reportStartDate}
              onChange={(e) => setReportStartDate(e.target.value)}
              max={reportEndDate || undefined}
            />
          </div>
          <div style={styles.field}>
            <label>Loppupäivä</label>
            <input
              style={{ ...styles.input, ...styles.dateInput }}
              type="date"
              value={reportEndDate}
              onChange={(e) => setReportEndDate(e.target.value)}
              min={reportStartDate || undefined}
            />
          </div>
        </div>
        <div style={styles.field}>
          <label>Tarkempi pyyntipaikka raportille</label>
          <RememberedTextInput
            value={reportSpotFilter}
            onChange={(e) => setReportSpotFilter(e.target.value)}
            options={reportSpotOptions}
            placeholder="Esim. osakaskunnan nimi"
            listId="report-spot-options-premium"
          />
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
        <div style={styles.muted}>Valittu rajaus: {reportScopeLabel}</div>
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
        <div style={{ ...styles.card, ...styles.reportTypeCard, background: "#f8fafc", borderColor: "#94a3b8" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", overflowWrap: "anywhere" }}>
            Sisävesikalastuksen saalisilmoitus
          </div>
          <div style={{ ...styles.muted, marginTop: 8 }}>
            Sisältää valitun aikavälin sisävesiltä kirjatut saaliit.
          </div>
          <div style={{ ...styles.noticeInfo, whiteSpace: "pre-line", marginTop: 12 }}>
            Sisävesien virallinen saalisilmoitus käyttää erillistä raporttia, jossa tiedot esitetään kalastamisalueen numerolla, pyydyskoodilla ja purkamispaikan numerolla täyttöohjeen mukaisesti.
            {"\n"}Kilot pyöristetään siinä täysiin kiloihin virallisen ilmoituksen vuoksi, mutta appin oma kaupallinen data säilyy ennallaan.
            {"\n"}Ilmoitus toimitetaan viranomaiselle tallentamalla kalastuspäiväkohtaiset saalisrivit suoraan Sisävesisaalisilmoitus-järjestelmään. Excelin lataaminen tai lähettäminen omaan sähköpostiin ei toimita ilmoitusta viranomaiselle.
          </div>
          <div style={{ marginTop: 10 }}>
            <a href="https://sisaalis.mmm.fi/sisaalis/" target="_blank" rel="noreferrer">
              Avaa virallinen Sisävesisaalisilmoitus-järjestelmä
            </a>
          </div>
          {officialCatchIssues.length > 0 ? (
            <div style={{ ...styles.noticeError, whiteSpace: "pre-line", marginTop: 12 }}>
              Sisävesikalastuksen saalisilmoitusta ei voi muodostaa ennen kuin puuttuvat tiedot on täydennetty.
              {"\n"}Puuttuvia tietoja löytyi {officialCatchIssues.length} saaliserältä.
              {"\n"}{officialCatchIssues.slice(0, 5).map((issue) => `- ${issue}`).join("\n")}
              {officialCatchIssues.length > 5 ? `\n- ...ja ${officialCatchIssues.length - 5} muuta puutetta` : ""}
            </div>
          ) : null}
          <div style={{ ...styles.row, marginTop: 12 }}>
            <button
              style={{ ...styles.button, ...styles.primaryButton, ...styles.reportActionButton }}
              onClick={() => {
                if (officialCatchIssues.length > 0) {
                  setAuthError("Sisävesikalastuksen saalisilmoitusta ei voi ladata ennen kuin puuttuvat tiedot on täydennetty.");
                  return;
                }
                void exportSpreadsheet(`virallinen-saalisilmoitus-${reportStartDate || "alku"}-${reportEndDate || today()}.xlsx`, officialCatchWorkbook, "Virallinen saalisilmoitus");
              }}
              disabled={officialCatchIssues.length > 0}
            >
              Lataa sisävesikalastuksen saalisilmoitus Exceliin
            </button>
            <button
              style={{ ...styles.button, ...styles.reportActionButton }}
              onClick={() => {
                if (officialCatchIssues.length > 0) {
                  setAuthError("Sisävesikalastuksen saalisilmoitusta ei voi lähettää ennen kuin puuttuvat tiedot on täydennetty.");
                  return;
                }
                const filename = `virallinen-saalisilmoitus-${reportStartDate || "alku"}-${reportEndDate || today()}.xlsx`;
                setReportSendingKey("official_catch");
                void sendReportEmail({
                  filename,
                  rows: officialCatchWorkbook,
                  sheetName: "Virallinen saalisilmoitus",
                  reportLabel: "Sisävesikalastuksen saalisilmoitus",
                })
                  .then(() => setAuthInfo(`Sisävesikalastuksen saalisilmoitus lähetetty osoitteeseen ${normalizeEmail(reportEmail)}.`))
                  .catch((error) => setAuthError(String(error?.message || error)))
                  .finally(() => setReportSendingKey(""));
              }}
              disabled={reportSendingKey === "official_catch" || officialCatchIssues.length > 0}
            >
              {reportSendingKey === "official_catch" ? "Lähetetään..." : "Lähetä sisävesikalastuksen saalisilmoitus sähköpostiin"}
            </button>
          </div>
        </div>
        <div style={{ ...styles.card, ...styles.reportTypeCard, background: "#f0f9ff", borderColor: "#7dd3fc" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#075985", overflowWrap: "anywhere" }}>
            Rannikkokalastuksen saalisilmoitus
          </div>
          <div style={{ ...styles.muted, marginTop: 8 }}>
            Kuukausikooste sisältää vain alle 10 metrin aluksilla tai ilman alusta kirjatut merisaaliit. Vähintään 10 metrin alusten tiedot kuuluvat aluskohtaiseen kalastuspäiväkirjaan.
            Lohi ja turska ilmoitetaan aina päiväkohtaisella purkamisilmoituksella.
          </div>
          <div style={{ ...styles.noticeInfo, marginTop: 12 }}>
            Excel-kooste tai sen lähettäminen omaan sähköpostiin ei toimita rannikkokalastusilmoitusta viranomaiselle. Ilmoituksen tiedot tallennetaan ja lähetetään merialueen sähköisessä saalisilmoitusjärjestelmässä.
          </div>
          <div style={{ marginTop: 10 }}>
            <a href="https://saalisilmoitus.mmm.fi/" target="_blank" rel="noreferrer">
              Avaa virallinen merialueen saalisilmoitusjärjestelmä
            </a>
          </div>
          {coastalCatchIssues.length > 0 ? (
            <div style={{ ...styles.noticeError, whiteSpace: "pre-line", marginTop: 12 }}>
              Rannikkokalastusilmoituksessa on {coastalCatchIssues.length} puutteellista saaliserää.
              {"\n"}{coastalCatchIssues.slice(0, 5).map((issue) => `- ${issue}`).join("\n")}
              {coastalCatchIssues.length > 5 ? `\n- ...ja ${coastalCatchIssues.length - 5} muuta puutetta` : ""}
            </div>
          ) : null}
          <div style={{ ...styles.row, marginTop: 12 }}>
            <button
              style={{ ...styles.button, ...styles.primaryButton, ...styles.reportActionButton }}
              onClick={() => {
                if (coastalCatchIssues.length > 0) {
                  setAuthError("Rannikkokalastuksen saalisilmoitusta ei voi ladata ennen kuin puuttuvat saalistiedot on täydennetty.");
                  return;
                }
                void exportSpreadsheet(
                  `rannikkokalastuksen-saalisilmoitus-${reportStartDate || "alku"}-${reportEndDate || today()}.xlsx`,
                  coastalCatchWorkbook,
                  "Rannikkoilmoitus",
                );
              }}
              disabled={coastalReportEntries.length === 0 || coastalCatchIssues.length > 0}
            >
              Lataa rannikkokalastuksen saalisilmoitus Exceliin
            </button>
            <button
              style={{ ...styles.button, ...styles.reportActionButton }}
              onClick={() => {
                if (coastalCatchIssues.length > 0) {
                  setAuthError("Rannikkokalastuksen saalisilmoitusta ei voi lähettää ennen kuin puuttuvat saalistiedot on täydennetty.");
                  return;
                }
                const filename = `rannikkokalastuksen-saalisilmoitus-${reportStartDate || "alku"}-${reportEndDate || today()}.xlsx`;
                setReportSendingKey("coastal_catch");
                void sendReportEmail({
                  filename,
                  rows: coastalCatchWorkbook,
                  sheetName: "Rannikkoilmoitus",
                  reportLabel: "Rannikkokalastuksen saalisilmoitus",
                })
                  .then(() => setAuthInfo(`Rannikkokalastuksen saalisilmoitus lähetetty osoitteeseen ${normalizeEmail(reportEmail)}.`))
                  .catch((error) => setAuthError(String(error?.message || error)))
                  .finally(() => setReportSendingKey(""));
              }}
              disabled={coastalReportEntries.length === 0 || coastalCatchIssues.length > 0 || reportSendingKey === "coastal_catch"}
            >
              {reportSendingKey === "coastal_catch" ? "Lähetetään..." : "Lähetä rannikkokalastuksen saalisilmoitus sähköpostiin"}
            </button>
          </div>
          <div style={{ ...styles.small, marginTop: 8 }}>
            Raportti ryhmittelee saaliit kuukausittain ja sisältää pyydysten lukumäärän, pyyntipäivät sekä mahdollisen keskimääräisen kalastusajan. Tarkista Excel ennen sen toimittamista.
          </div>
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
                  <td style={{ padding: "12px 10px", borderBottom: "1px solid #e2e8f0" }}>{session.spotLabel || "-"}</td>
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
    const billingUnit = getOfferDisplayUnit(offer);
    const invoiceLines = parseSellerInvoiceLineItems(offer);
    const billingQuantity = billingUnit === "kpl"
      ? invoiceLines.filter((line) => line.unit === "kpl").reduce((sum, line) => sum + Number(line.quantity || 0), 0)
      : kilos;
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
      billingKilos: billingUnit === "kg" ? billingQuantity : 0,
      billingPieces: billingUnit === "kpl" ? billingQuantity : 0,
      billingQuantity,
      billingUnit,
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
        totalPieces: 0,
        totalTradeValue: 0,
        totalCommissionValue: 0,
      };
    }

    acc[groupKey].offers.push(offer);
    acc[groupKey].totalKilos += offer.billingKilos;
    acc[groupKey].totalPieces += offer.billingPieces;
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
    acc.totalPieces += offer.billingPieces;
    acc.totalTradeValue += offer.tradeValue;
    acc.totalCommissionValue += offer.commissionValue;
    acc.totalTrades += 1;
    return acc;
  }, {
    totalKilos: 0,
    totalPieces: 0,
    totalTradeValue: 0,
    totalCommissionValue: 0,
    totalTrades: 0,
  });

  const exportBillingCsv = (group) => {
    void exportSpreadsheet(
      `laskutus-${group.monthKey}-${group.sellerLabel.replace(/[^a-z0-9åäö_-]+/gi, "-")}.xlsx`,
      [
        ["Kuukausi", "Myyjä", "Ostaja", "Erä", "Määrä", "Yksikkö", "Yksikköhinta €", "Kaupan arvo €", "Komissio %", "Komissio €", "Päivä", "Tila"],
        ...group.offers.map((offer) => [
          group.monthKey,
          group.sellerLabel,
          offer.buyerLabel,
          String(offer.species_summary || "").split("\n").join(" | "),
          offer.billingQuantity,
          offer.billingUnit,
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
          {monthSummary.totalKilos > 0 ? <span style={styles.badge}>{monthSummary.totalKilos.toFixed(1)} kg</span> : null}
          {monthSummary.totalPieces > 0 ? <span style={styles.badge}>{monthSummary.totalPieces.toLocaleString("fi-FI")} kpl</span> : null}
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
              {group.totalKilos > 0 ? <span style={styles.badge}>{group.totalKilos.toFixed(1)} kg</span> : null}
              {group.totalPieces > 0 ? <span style={styles.badge}>{group.totalPieces.toLocaleString("fi-FI")} kpl</span> : null}
              <span style={styles.badge}>{euro(group.totalTradeValue)} kaupan arvo</span>
              <span style={styles.badge}>{euro(group.totalCommissionValue)} komissio</span>
              <span style={styles.badge}>{group.offers.length} kauppaa</span>
            </div>

            {expandedBillingGroupKey === `${group.monthKey}-${group.sellerKey}` ? group.offers.map((offer) => (
              <div key={offer.id} style={styles.entry}>
                <div style={styles.entryBadges}>
                  <span style={styles.badge}>{offer.buyerLabel}</span>
                  <span style={styles.badge}>{offer.billingQuantity.toLocaleString("fi-FI")} {offer.billingUnit}</span>
                <span style={styles.badge}>{euro(offer.billingPricePerKg)} / {offer.billingUnit} ALV 0 %</span>
                <span style={styles.badge}>{euro(calculateGrossPrice(offer.billingPricePerKg) || 0)} / {offer.billingUnit} sis. ALV {formatVatPercent()} %</span>
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
    const kiloMatch = String(visibleLine || "").match(/:\s*([0-9]+(?:[.,][0-9]+)?)\s*kg/i);
    const isCrayfishLine = isCrayfishSpecies(description);
    const parsedSummaryQuantity = Number((isCrayfishLine ? parseCrayfishCountFromSummaryLine(visibleLine) : parseLocaleNumber(kiloMatch?.[1])) || 0);
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

function buildDeliveryNoteNumber(source) {
  const datePart = String(source?.updated_at || source?.created_at || today()).slice(0, 10).replace(/\D/g, "") || today().replace(/\D/g, "");
  const idPart = String(source?.id || source?.batch_id || "").replace(/[^a-zA-Z0-9]+/g, "").slice(0, 8).toUpperCase() || "00000001";
  return `LAH-${datePart}-${idPart}`;
}

function buildDeliveryNotePayload(offer, entry, sellerProfile) {
  const summaryBatches = getOfferSummaryBatchItems(offer?.species_summary);
  const lineItems = parseSellerInvoiceLineItems(offer);
  const areaText = [
    offer?.area || entry?.area,
    entry?.municipality,
    offer?.spot || entry?.spot,
  ].map((value) => String(value || "").trim()).filter(Boolean).join(" / ");
  const products = lineItems.map((item, index) => {
    const batchItem = summaryBatches[index] || summaryBatches.find((row) => row.label === item.description) || {};
    const metadata = getSpeciesMetadata(item.description || batchItem.label);
    return {
      description: item.description || batchItem.label || "Kalaerä",
      scientificName: metadata?.scientific || "",
      faoCode: metadata?.fao || "",
      quantity: item.quantityDisplay || "-",
      batchId: batchItem.batchId || offer?.batch_id || entry?.batchId || "",
      catchDate: batchItem.catchDate || getOfferSummaryCatchDates(offer?.species_summary)[index] || entry?.date || "",
      catchArea: areaText,
      vesselId: entry?.commercialFishingVesselId || sellerProfile?.commercial_fishing_vessel_id || "",
      productionMethod: `Tuotantomenetelmä: pyydetty (${entry?.waterType === "sea" ? "meri" : entry?.waterType === "lake" ? "sisävesi" : "kalastusvesi"})`,
      frozenStatus: "Tuotteen tila: tuore, ei ilmoitettu aiemmin jäädytetyksi",
    };
  });
  return {
    number: buildDeliveryNoteNumber(offer),
    shipmentDate: today(),
    sender: {
      name: offer?.seller_company_name || offer?.seller_name || sellerProfile?.company_name || sellerProfile?.display_name || sellerProfile?.email || "",
      address: formatInvoicePartyAddress(
        offer?.seller_address || sellerProfile?.address,
        offer?.seller_postcode || sellerProfile?.postcode,
        offer?.seller_city || sellerProfile?.city,
      ),
      businessId: offer?.seller_business_id || sellerProfile?.business_id || "",
      contactName: offer?.seller_contact_name || sellerProfile?.contact_name || "",
      email: offer?.seller_contact_email || offer?.seller_email || sellerProfile?.contact_email || sellerProfile?.email || "",
      phone: offer?.seller_phone || sellerProfile?.phone || "",
    },
    recipient: {
      name: offer?.buyer_company_name || offer?.buyer_contact_name || offer?.buyer_email || "",
      address: formatInvoicePartyAddress(
        offer?.buyer_delivery_address,
        offer?.buyer_delivery_postcode,
        offer?.buyer_delivery_city,
      ),
      businessId: offer?.buyer_business_id || "",
      contactName: offer?.buyer_contact_name || "",
      email: offer?.buyer_email || "",
      phone: offer?.buyer_phone || "",
    },
    products,
    delivery: {
      method: offer?.delivery_method || entry?.deliveryMethod || "",
      coldTransport: Boolean(offer?.cold_transport ?? entry?.coldTransport),
      earliestDate: offer?.earliest_delivery_date || entry?.earliestDeliveryDate || "",
      storage: "Tuore kala säilytetään ja kuljetetaan lähellä sulavan jään lämpötilaa (0–+2 °C).",
    },
  };
}

function buildAuctionDeliveryNotePayload(auction, sellerProfile) {
  const winner = auction?.winner_details || {};
  const seller = auction?.seller_details || sellerProfile || {};
  const metadata = getSpeciesMetadata(auction?.species);
  return {
    number: buildDeliveryNoteNumber(auction),
    shipmentDate: today(),
    sender: {
      name: seller.company_name || seller.display_name || seller.email || "",
      address: formatInvoicePartyAddress(seller.address, seller.postcode, seller.city),
      businessId: seller.business_id || "",
      contactName: seller.contact_name || "",
      email: seller.contact_email || seller.email || "",
      phone: seller.phone || "",
    },
    recipient: {
      name: winner.company_name || winner.contact_name || winner.email || "",
      address: formatInvoicePartyAddress(winner.delivery_address, winner.delivery_postcode, winner.delivery_city),
      businessId: winner.business_id || "",
      contactName: winner.contact_name || "",
      email: winner.email || "",
      phone: winner.phone || "",
    },
    products: [{
      description: auction?.species || "Kalaerä",
      scientificName: metadata?.scientific || "",
      faoCode: metadata?.fao || "",
      quantity: `${Number(auction?.total_quantity ?? auction?.total_kilos ?? 0).toLocaleString("fi-FI")} ${auction?.quantity_unit === "kpl" ? "kpl" : "kg"}`,
      batchId: auction?.batch_id || "",
      catchDate: auction?.catch_date || "",
      catchArea: [auction?.area, auction?.municipality, auction?.spot].filter(Boolean).join(" / "),
      vesselId: auction?.commercial_fishing_vessel_id || seller.commercial_fishing_vessel_id || "",
      productionMethod: "Tuotantomenetelmä: pyydetty",
      frozenStatus: "Tuotteen tila: tuore, ei ilmoitettu aiemmin jäädytetyksi",
    }],
    delivery: {
      method: auction?.delivery_method || "Nouto",
      coldTransport: Boolean(auction?.cold_transport),
      earliestDate: auction?.earliest_delivery_date || "",
      storage: "Tuore kala säilytetään ja kuljetetaan lähellä sulavan jään lämpötilaa (0–+2 °C).",
    },
  };
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

function formatInvoiceLineItemsSummary(lineItems, vatRate) {
  const normalizedVatRate = Number(vatRate || 0);
  const rows = Array.isArray(lineItems) ? lineItems : [];
  const visibleRows = rows.filter((item) => String(item?.description || "").trim() && String(item?.description || "").trim().toLowerCase() !== "toimituskulu");
  if (visibleRows.length === 0) return "-";
  return visibleRows.map((item) => {
    const description = String(item.description || "Kalaerä").trim();
    const quantityDisplay = String(item.quantityDisplay || "-").trim();
    const unitPrice = Number(item.unitPrice || 0);
    const unitGrossPrice = Number(item.unitGrossPrice || (unitPrice * (1 + normalizedVatRate)) || 0);
    return `${description}: ${quantityDisplay} · Hinta ALV 0 % ${euro(unitPrice)} / ${item.unit || "kg"} · Hinta sis. ALV ${(normalizedVatRate * 100).toLocaleString("fi-FI")} % ${euro(unitGrossPrice)} / ${item.unit || "kg"}`;
  }).join("\n");
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
  const quantityX = 102;
  const unitPriceNetX = 121;
  const unitPriceGrossX = 140;
  const vatAmountX = 156;
  const totalNetX = 172;
  const totalGrossX = rightX;
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
    const itemLines = doc.splitTextToSize(item.description, 74);
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
    doc.setFontSize(10);
    doc.text(itemLines, leftX + 2, textY);
    doc.setFontSize(8.4);
    doc.text(item.quantityDisplay || "-", quantityX, textY, { align: "right" });
    doc.text(item.unitPrice > 0 ? euro(item.unitPrice) : "-", unitPriceNetX, textY, { align: "right" });
    doc.text(item.unitGrossPrice > 0 ? euro(item.unitGrossPrice) : "-", unitPriceGrossX, textY, { align: "right" });
    doc.text(euro(item.vatAmount || 0), vatAmountX, textY, { align: "right" });
    doc.text(euro(item.lineTotal || 0), totalNetX, textY, { align: "right" });
    doc.text(euro(item.grossTotal || 0), totalGrossX, textY, { align: "right" });
    doc.setFontSize(10);
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
    doc.setFontSize(10);
    doc.text("Toimituskulu", leftX + 2, deliveryTextY);
    doc.setFontSize(8.4);
    doc.text("-", quantityX, deliveryTextY, { align: "right" });
    doc.text("-", unitPriceNetX, deliveryTextY, { align: "right" });
    doc.text("-", unitPriceGrossX, deliveryTextY, { align: "right" });
    doc.text(euro(invoice.deliveryVatAmount || 0), vatAmountX, deliveryTextY, { align: "right" });
    doc.text(euro(invoice.deliveryCost), totalNetX, deliveryTextY, { align: "right" });
    doc.text(euro((invoice.deliveryCost || 0) + (invoice.deliveryVatAmount || 0)), totalGrossX, deliveryTextY, { align: "right" });
    doc.setFontSize(10);
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
  doc.text("Maksettava yhteensä", 124, totalsY + 37);
  doc.text(euro(invoice.grandTotal), 192, totalsY + 37, { align: "right" });

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

async function openSellerInvoicePdf(offer, sellerProfile, options = {}) {
  const { doc, invoice } = await buildSellerInvoicePdfDoc(offer, sellerProfile);
  await presentPdfDocument(doc, `${invoice.invoiceNumber}.pdf`, {
    browserAction: "open",
    targetWindow: options.targetWindow,
    dedupeKey: options.dedupeKey,
    skipDuplicateGuard: options.skipDuplicateGuard,
  });
  return invoice;
}

async function openSellerGroupInvoicePdf(offers, sellerProfile, options = {}) {
  const { doc, invoice } = await buildSellerGroupInvoicePdfDoc(offers, sellerProfile);
  await presentPdfDocument(doc, `${invoice.invoiceNumber}.pdf`, {
    browserAction: "open",
    targetWindow: options.targetWindow,
    dedupeKey: options.dedupeKey,
    skipDuplicateGuard: options.skipDuplicateGuard,
  });
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

function getBuyerInvoiceStatusLabel(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "paid") return "Maksettu";
  if (normalized === "invoiced") return "Avoin";
  return "Laskuttamaton";
}

function getBuyerInvoiceGroupingBucket(offer) {
  const source = String(offer?.paid_at || offer?.billed_at || offer?.updated_at || offer?.created_at || "").trim();
  if (!source) return "";

  try {
    const value = new Date(source);
    if (Number.isNaN(value.getTime())) return source.slice(0, 16);
    value.setSeconds(0, 0);
    return value.toISOString().slice(0, 16);
  } catch {
    return source.slice(0, 16);
  }
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
  const quantityX = 102;
  const unitPriceNetX = 121;
  const unitPriceGrossX = 140;
  const vatAmountX = 156;
  const totalNetX = 172;
  const totalGrossX = rightX;
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
    const titleLines = doc.splitTextToSize(item.description, 70);
    const detailLines = item.detailLine ? doc.splitTextToSize(String(item.detailLine), 70) : [];
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
    doc.setFontSize(8.2);
    doc.text(item.quantityDisplay || "-", quantityX, textY, { align: "right" });
    doc.text(item.unitPrice > 0 ? euro(item.unitPrice) : "-", unitPriceNetX, textY, { align: "right" });
    doc.text(item.unitGrossPrice > 0 ? euro(item.unitGrossPrice) : "-", unitPriceGrossX, textY, { align: "right" });
    doc.text(euro(item.vatAmount || 0), vatAmountX, textY, { align: "right" });
    doc.text(euro(item.lineTotal || 0), totalNetX, textY, { align: "right" });
    doc.text(euro(item.grossTotal || 0), totalGrossX, textY, { align: "right" });
    doc.setFontSize(9.2);
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
  doc.text("Maksettava yhteensä", 124, totalsY + 22);
  doc.text(euro(invoice.grandTotal), 192, totalsY + 22, { align: "right" });

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
                <strong>Erä:</strong> {formatInvoiceLineItemsSummary(invoicePayload.lineItems, invoicePayload.vatRate)}
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
  const [publicBatchId, setPublicBatchId] = useState(() => getRequestedPublicBatchId());
  const [consumerListingId, setConsumerListingId] = useState(() => getRequestedConsumerListingId());
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
  const [consumerListings, setConsumerListings] = useState([]);
  const [processedEntries, setProcessedEntries] = useState([]);
  const [offers, setOffers] = useState([]);
  const [buyerOffers, setBuyerOffers] = useState([]);
  const [buyerOffersFilter, setBuyerOffersFilter] = useState("new");
  const [billingFilter, setBillingFilter] = useState("unbilled");
  const [buyerOffersSearch, setBuyerOffersSearch] = useState("");
  const [buyerActiveOfferId, setBuyerActiveOfferId] = useState(null);
  const [buyerActionMode, setBuyerActionMode] = useState("counter");
  const [helpOpen, setHelpOpen] = useState(false);
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
  const [authForm, setAuthForm] = useState({ email: "", password: "", confirmPassword: "", displayName: "", requestedRole: "member", acceptedTerms: false });
  const [authError, setAuthError] = useState("");
  const [authInfo, setAuthInfo] = useState("");
  const [authWarning, setAuthWarning] = useState("");
  const [premiumPurchaseBusy, setPremiumPurchaseBusy] = useState(false);
  const [showAppleStoreKitTestPurchase, setShowAppleStoreKitTestPurchase] = useState(false);
  const visibleAuthError = formatVisibleAuthErrorMessage(authError);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [auctionsAvailable, setAuctionsAvailable] = useState(false);
  const [pendingEntriesScrollTarget, setPendingEntriesScrollTarget] = useState("");
  const [pendingAuctionTarget, setPendingAuctionTarget] = useState(null);
  const [auctionCreateRequestKey, setAuctionCreateRequestKey] = useState(0);
  const [pendingOfferTarget, setPendingOfferTarget] = useState(null);
  const [focusedFixedOfferId, setFocusedFixedOfferId] = useState("");
  const [buyerMenuOpen, setBuyerMenuOpen] = useState(false);

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
      area: getOfficialMarineArea(defaults.area)?.name || defaults.area,
      waterType: defaults.waterType || "",
      municipality: defaults.municipality,
      landingPlace: defaults.landingPlace,
      gearCount: initialGearDefaults.gearCount,
      fishingDurationDays: initialGearDefaults.fishingDurationDays,
      fishingSecondaryValue: "",
      inlandGearCode: getInlandGearCode(defaults.gear),
      inlandGearPresetId: "",
      managementFishing: false,
      effortOnly: false,
      gearLength: "",
      gearWidth: "",
      otherGearName: "",
      originCity: "",
      selectedVesselId: "",
      fishingWithoutVessel: false,
      vesselLengthClass: "",
      icesSubdivision: getOfficialMarineArea(defaults.area)?.icesSubdivision || "",
      statisticalRectangle: "",
      marineGearCode: "",
      releasedCatchDetails: "",
      incidentalBycatchDetails: "",
      lostGearDetails: "",
      spot: "",
      gear: defaults.gear,
      netHeight: initialGearDefaults.netHeight,
      netMeshSize: initialGearDefaults.netMeshSize,
      fykeHeight: initialGearDefaults.fykeHeight,
      price_per_kg: "",
      notes: "",
      packaging: "",
      saleMode: "none",
      listForSale: false,
      consumerProductName: "",
      consumerProductNameAutoFilled: false,
      consumerDescription: "",
      consumerPickupLocation: "",
      consumerPickupDate: today(),
      consumerPickupStartTime: "12:00",
      consumerPickupEndTime: "13:00",
      consumerOrderDeadlineHours: "2",
      consumerSaleUnitType: "package",
      consumerVariants: [createConsumerSaleVariant("package")],
      auctionDurationMinutes: 180,
      auctionMinimumIncrement: "0,20",
      auctionReservePrice: "",
      offerToShops: false,
      offerToRestaurants: false,
      offerToWholesalers: false,
      offerAudience: "groups",
      selectedBuyerIds: [],
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
  const [auctionImageFile, setAuctionImageFile] = useState(null);
  const [auctionImagePreviewUrl, setAuctionImagePreviewUrl] = useState("");

  useEffect(() => () => {
    if (auctionImagePreviewUrl) URL.revokeObjectURL(auctionImagePreviewUrl);
  }, [auctionImagePreviewUrl]);

  const handleAuctionImageSelection = async (event) => {
    const selectedFile = event.target.files?.[0] || null;
    event.target.value = "";
    if (!selectedFile) return;
    if (!ALLOWED_AUCTION_IMAGE_TYPES.includes(selectedFile.type)) {
      setAuthError("Valitse huutokauppaan JPG-, PNG- tai WebP-kuva.");
      return;
    }
    try {
      setAuthError("");
      const preparedFile = await prepareAuctionImage(selectedFile);
      setAuctionImageFile(preparedFile);
      setAuctionImagePreviewUrl(URL.createObjectURL(preparedFile));
    } catch (imageError) {
      setAuthError(String(imageError?.message || imageError || "Huutokauppakuvan käsittely epäonnistui."));
    }
  };
  const [savedCustomLakeAreas, setSavedCustomLakeAreas] = useState(() => initialCatchDefaults.customLakeAreas || []);
  const [savedCustomSeaAreas, setSavedCustomSeaAreas] = useState(() => initialCatchDefaults.customSeaAreas || []);
  const [catchAreaSelector, setCatchAreaSelector] = useState(() => resolveAreaSelectorValue(initialCatchDefaults.area, initialCatchDefaults.customLakeAreas, initialCatchDefaults.customSeaAreas));
  const [savedLandingPlaces, setSavedLandingPlaces] = useState(() => getStoredCatchFormDefaults().landingPlaces || []);
  const [savedGearProfiles, setSavedGearProfiles] = useState(() => initialCatchDefaults.gearProfiles || {});
  const [savedInlandGearPresets, setSavedInlandGearPresets] = useState(() => initialCatchDefaults.inlandGearPresets || []);
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
    auction_email_enabled: true,
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
  const [accountDeletionBusy, setAccountDeletionBusy] = useState(false);
  const foregroundNotificationRef = useRef({ key: "", at: 0 });
  const pushRegistrationKeyRef = useRef("");
  const currentPushTokenRef = useRef("");
  const tabsScrollRef = useRef(null);
  const [tabCarouselEdges, setTabCarouselEdges] = useState({ canScrollLeft: false, canScrollRight: true });
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
  const [salesSelectionMode, setSalesSelectionMode] = useState(false);
  const [sendInvoiceCopyToSelf, setSendInvoiceCopyToSelf] = useState(true);
  const [sendInvoiceCopyToAccountant, setSendInvoiceCopyToAccountant] = useState(false);
  const [accountFormDirty, setAccountFormDirty] = useState(false);

  useEffect(() => {
    if (activeTab !== "entries" || !pendingEntriesScrollTarget || typeof document === "undefined") return;

    let cancelled = false;
    let timeoutId = null;
    const targetId = `catch-entry-${pendingEntriesScrollTarget}`;

    const attemptScroll = (attempt = 0) => {
      if (cancelled) return;
      const target = document.getElementById(targetId);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        setPendingEntriesScrollTarget("");
        return;
      }
      if (attempt >= 12) return;
      timeoutId = window.setTimeout(() => attemptScroll(attempt + 1), 120);
    };

    timeoutId = window.setTimeout(() => attemptScroll(0), 80);

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [activeTab, pendingEntriesScrollTarget, entries, search, entryScope]);

  useEffect(() => {
    const offerId = String(pendingOfferTarget?.offerId || "").trim();
    if (activeTab !== "offers" || !offerId || buyerOffers.length === 0 || typeof document === "undefined") return undefined;
    const targetOffer = buyerOffers.find((offer) => String(offer.id || "") === offerId && !isAuctionTradeOffer(offer));
    if (!targetOffer) return undefined;

    if (profile?.role === "buyer") {
      setBuyerOffersSearch("");
      setBuyerOffersFilter(getBuyerOffersFilterForStatus(targetOffer.status));
      setBuyerActiveOfferId(offerId);
    }
    setFocusedFixedOfferId(offerId);

    let cancelled = false;
    let timeoutId = null;
    const targetId = profile?.role === "buyer" ? `buyer-offer-card-${offerId}` : `linked-buyer-offer-${offerId}`;

    const attemptScroll = (attempt = 0) => {
      if (cancelled) return;
      const target = document.getElementById(targetId);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        setPendingOfferTarget(null);
        return;
      }
      if (attempt >= 12) return;
      timeoutId = window.setTimeout(() => attemptScroll(attempt + 1), 120);
    };

    timeoutId = window.setTimeout(() => attemptScroll(0), 80);
    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [activeTab, buyerOffers, pendingOfferTarget, profile?.role]);

  useEffect(() => {
    if (!focusedFixedOfferId) return undefined;
    const timer = window.setTimeout(() => setFocusedFixedOfferId(""), 5000);
    return () => window.clearTimeout(timer);
  }, [focusedFixedOfferId]);
  const [accountBillingSameAsDelivery, setAccountBillingSameAsDelivery] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ newPassword: "", confirmPassword: "" });
  const [publicBatchData, setPublicBatchData] = useState(null);
  const [publicBatchLoading, setPublicBatchLoading] = useState(Boolean(publicBatchId));
  const [publicBatchError, setPublicBatchError] = useState("");
  const [slowBoot, setSlowBoot] = useState(false);
  const [labelPrintEntry, setLabelPrintEntry] = useState(null);
  const [catchSaleEntry, setCatchSaleEntry] = useState(null);
  const [catchSaleDraft, setCatchSaleDraft] = useState(() => createCatchSaleDraft());
  const [catchSaleSaving, setCatchSaleSaving] = useState(false);
  const [labelPrintCount, setLabelPrintCount] = useState(10);
  const [labelPrintPieceCount, setLabelPrintPieceCount] = useState("");
  const [labelPrintWeightKg, setLabelPrintWeightKg] = useState("");
  const [labelPrintProductForm, setLabelPrintProductForm] = useState("");
  const [labelPrintUseByDate, setLabelPrintUseByDate] = useState("");
  const [labelPrintFormat, setLabelPrintFormat] = useState(CATCH_LABEL_FORMAT_MUNBYN_4X3);
  const [labelPrintWaterType, setLabelPrintWaterType] = useState("");
  const [onboardingGuideState, setOnboardingGuideState] = useState({ views: 0, hiddenForever: false, visible: false });
  const accountFormSyncingRef = useRef(false);
  const fisherInfoSyncingRef = useRef(false);
  const accountFormInitializedRef = useRef(false);
  const catchDefaultsStorageKeyRef = useRef(getCatchFormDefaultsStorageKey(null));
  const labelModalHistoryActiveRef = useRef(false);

  useEffect(() => {
    const nextStorageKey = getCatchFormDefaultsStorageKey(profile);
    if (catchDefaultsStorageKeyRef.current === nextStorageKey) return;

    catchDefaultsStorageKeyRef.current = nextStorageKey;
    const defaults = getStoredCatchFormDefaults(profile);
    const gearDefaults = getStoredGearProfile(defaults, defaults.gear);
    const profilePickupAddress = getDefaultProfilePickupAddress(profile);
    const storedDeliveryArea = String(defaults.deliveryArea || "").trim();
    const cleanDeliveryArea = storedDeliveryArea && storedDeliveryArea === profilePickupAddress
      ? formatDeliveryDestinations(defaults.deliveryDestinations)
      : storedDeliveryArea;

    setForm((prev) => ({
      ...prev,
      area: defaults.area,
      waterType: defaults.waterType || String(profile?.water_type || "").trim(),
      municipality: defaults.municipality,
      landingPlace: defaults.landingPlace,
      gearCount: gearDefaults.gearCount,
      fishingDurationDays: gearDefaults.fishingDurationDays,
      gear: defaults.gear,
      inlandGearCode: getInlandGearCode(defaults.gear),
      inlandGearPresetId: "",
      netHeight: gearDefaults.netHeight,
      netMeshSize: gearDefaults.netMeshSize,
      fykeHeight: gearDefaults.fykeHeight,
      deliveryDestinations: defaults.deliveryDestinations || [],
      deliveryArea: cleanDeliveryArea,
    }));
    setSavedCustomLakeAreas(defaults.customLakeAreas || []);
    setSavedCustomSeaAreas(defaults.customSeaAreas || []);
    setCatchAreaSelector(resolveAreaSelectorValue(defaults.area, defaults.customLakeAreas, defaults.customSeaAreas));
    setSavedLandingPlaces(defaults.landingPlaces || []);
    setSavedGearProfiles(defaults.gearProfiles || {});
    setSavedInlandGearPresets(defaults.inlandGearPresets || []);
    setSavedGearCountOptions(gearDefaults.gearCountOptions || []);
    setSavedFishingDurationOptions(gearDefaults.fishingDurationOptions || []);
    setSavedNetHeightOptions(gearDefaults.netHeightOptions || []);
    setSavedNetMeshSizeOptions(gearDefaults.netMeshSizeOptions || []);
    setSavedFykeHeightOptions(gearDefaults.fykeHeightOptions || []);
    setProcessedForm((prev) => ({
      ...prev,
      deliveryDestinations: defaults.deliveryDestinations || [],
      deliveryArea: cleanDeliveryArea,
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
    ].filter((value) => isUuidLike(value))));
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
  const hasActiveGooglePlayFisherPremium = useMemo(() => {
    const subscriptionState = String(profile?.google_play_subscription_status || "").trim();
    const subscriptionExpiryTime = Date.parse(profile?.google_play_subscription_expires_at || "");
    return profile?.google_play_subscription_product_id === FISHER_PREMIUM_PRODUCT_ID
      && [
        "SUBSCRIPTION_STATE_ACTIVE",
        "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
        "SUBSCRIPTION_STATE_CANCELED",
      ].includes(subscriptionState)
      && Number.isFinite(subscriptionExpiryTime)
      && subscriptionExpiryTime > Date.now();
  }, [profile]);
  const hasActiveAppleFisherPremium = useMemo(() => {
    const subscriptionState = String(profile?.apple_subscription_status || "").trim();
    const subscriptionExpiryTime = Date.parse(profile?.apple_subscription_expires_at || "");
    return profile?.apple_subscription_product_id === APPLE_FISHER_PREMIUM_PRODUCT_ID
      && ["ACTIVE", "IN_GRACE_PERIOD"].includes(subscriptionState)
      && Number.isFinite(subscriptionExpiryTime)
      && subscriptionExpiryTime > Date.now();
  }, [profile]);
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

  const verifyAndApplyGooglePlayPurchase = useCallback(async (purchase) => {
    const purchaseToken = String(purchase?.purchaseToken || "").trim();
    if (!purchaseToken || !session?.access_token) {
      throw new Error("Google Play -ostoksen tunniste puuttuu.");
    }
    const { data, error } = await verifyGooglePlaySubscription(session.access_token, {
      productId: FISHER_PREMIUM_PRODUCT_ID,
      purchaseToken,
    });
    if (error) throw new Error(error.message);
    if (data?.profile) setProfile(data.profile);
    setRefreshTick((previous) => previous + 1);
    return Boolean(data?.entitled);
  }, [session?.access_token]);

  const verifyAndApplyApplePurchase = useCallback(async (purchase) => {
    const transactionId = String(purchase?.transactionId || "").trim();
    const signedTransactionInfo = String(purchase?.signedTransactionInfo || "").trim();
    if (!transactionId || !signedTransactionInfo || !session?.access_token) {
      throw new Error("App Store -ostoksen tunniste puuttuu.");
    }
    const { data, error } = await verifyAppleSubscription(session.access_token, {
      productId: APPLE_FISHER_PREMIUM_PRODUCT_ID,
      transactionId,
      signedTransactionInfo,
    });
    if (error) throw new Error(error.message);
    if (data?.profile) setProfile(data.profile);
    if (data?.entitled) await finishAppleStoreKitTransaction(transactionId);
    setRefreshTick((previous) => previous + 1);
    return Boolean(data?.entitled);
  }, [session?.access_token]);

  useEffect(() => {
    let cancelled = false;
    if (!isAppleStoreKitAvailable()) {
      setShowAppleStoreKitTestPurchase(false);
      return () => { cancelled = true; };
    }
    isAppleStoreKitDebugBuild()
      .then((enabled) => {
        if (!cancelled) setShowAppleStoreKitTestPurchase(enabled);
      })
      .catch(() => {
        if (!cancelled) setShowAppleStoreKitTestPurchase(false);
      });
    return () => { cancelled = true; };
  }, []);

  const refreshFisherPremiumEntitlement = useCallback(async () => {
    if (profile?.role !== "member") return true;
    if (isFisherPremiumProfile(profile)) return true;
    if (isGooglePlayBillingAvailable()) {
      const result = await restoreFisherPremiumPurchases();
      const purchase = findFisherPremiumPurchase(result?.purchases);
      if (!purchase) return false;
      return verifyAndApplyGooglePlayPurchase(purchase);
    }
    if (isAppleStoreKitAvailable()) {
      const result = await restoreAppleFisherPremiumPurchases({ synchronize: false });
      const purchase = findAppleFisherPremiumPurchase(result?.purchases);
      if (!purchase) return false;
      return verifyAndApplyApplePurchase(purchase);
    }
    return hasFisherPremium;
  }, [
    hasFisherPremium,
    profile,
    profile?.role,
    verifyAndApplyApplePurchase,
    verifyAndApplyGooglePlayPurchase,
  ]);

  const handlePurchaseFisherPremium = useCallback(async () => {
    setPremiumPurchaseBusy(true);
    setAuthError("");
    setAuthInfo("");
    try {
      let entitled = false;
      if (isAppleStoreKitAvailable()) {
        await getAppleFisherPremiumProduct();
        const result = await purchaseAppleFisherPremium(profile?.id);
        if (result?.pending) {
          setAuthInfo("App Store -osto odottaa hyväksyntää. Premium aktivoituu hyväksynnän jälkeen.");
          return;
        }
        entitled = await verifyAndApplyApplePurchase(result?.purchase);
      } else {
        const product = await getFisherPremiumProduct();
        const offerToken = product?.offers?.[0]?.offerToken || "";
        const result = await purchaseFisherPremium(offerToken);
        entitled = await verifyAndApplyGooglePlayPurchase(result?.purchase);
      }
      setAuthInfo(entitled
        ? "Kalastajan Premium on aktivoitu."
        : "Tilaus vastaanotettiin, mutta Premium ei ole vielä aktiivinen.");
    } catch (error) {
      if (String(error?.code || "") !== "USER_CANCELED") {
        setAuthError(String(error?.message || error || "Premium-tilauksen ostaminen epäonnistui."));
      }
    } finally {
      setPremiumPurchaseBusy(false);
    }
  }, [profile?.id, verifyAndApplyApplePurchase, verifyAndApplyGooglePlayPurchase]);

  const handleTestApplePremiumPurchase = useCallback(async () => {
    setPremiumPurchaseBusy(true);
    setAuthError("");
    setAuthInfo("");
    try {
      const debugBuild = await isAppleStoreKitDebugBuild();
      if (!debugBuild) throw new Error("StoreKit-testi on käytettävissä vain Xcoden Debug-versiossa.");
      await getAppleFisherPremiumProduct();
      const result = await purchaseAppleFisherPremium(profile?.id);
      if (result?.pending) {
        setAuthInfo("Xcoden StoreKit-testi odottaa hyväksyntää.");
        return;
      }
      const transactionId = String(result?.purchase?.transactionId || "").trim();
      if (!transactionId) throw new Error("StoreKit-testitapahtuman tunniste puuttuu.");
      await finishAppleStoreKitTransaction(transactionId);
      setAuthInfo("Xcoden StoreKit-osto onnistui. Testi ei muuttanut oikeaa Premium-oikeutta eikä lähettänyt kuittia palvelimelle.");
    } catch (error) {
      if (String(error?.code || "") !== "USER_CANCELED") {
        setAuthError(String(error?.message || error || "StoreKit-testin suorittaminen epäonnistui."));
      }
    } finally {
      setPremiumPurchaseBusy(false);
    }
  }, [profile?.id]);

  const handleRestoreFisherPremium = useCallback(async () => {
    setPremiumPurchaseBusy(true);
    setAuthError("");
    setAuthInfo("");
    try {
      const appleStore = isAppleStoreKitAvailable();
      const result = appleStore
        ? await restoreAppleFisherPremiumPurchases({ synchronize: true })
        : await restoreFisherPremiumPurchases();
      const purchase = appleStore
        ? findAppleFisherPremiumPurchase(result?.purchases)
        : findFisherPremiumPurchase(result?.purchases);
      if (!purchase) {
        setAuthInfo(`Tällä ${appleStore ? "Apple" : "Google Play"} -tilillä ei löytynyt aktiivista Premium-tilausta.`);
        return;
      }
      const entitled = appleStore
        ? await verifyAndApplyApplePurchase(purchase)
        : await verifyAndApplyGooglePlayPurchase(purchase);
      setAuthInfo(entitled
        ? "Premium-tilaus palautettiin onnistuneesti."
        : "Tilaus löytyi, mutta sen käyttöoikeus ei ole aktiivinen.");
    } catch (error) {
      setAuthError(String(error?.message || error || "Tilauksen palauttaminen epäonnistui."));
    } finally {
      setPremiumPurchaseBusy(false);
    }
  }, [verifyAndApplyApplePurchase, verifyAndApplyGooglePlayPurchase]);

  useEffect(() => {
    if (
      profile?.role !== "member"
      || !profile?.id
      || !session?.access_token
      || (!isGooglePlayBillingAvailable() && !isAppleStoreKitAvailable())
    ) return;

    let cancelled = false;
    const refreshGoogleEntitlement = async () => {
      try {
        if (!cancelled) await refreshFisherPremiumEntitlement();
      } catch (error) {
        console.warn("Store subscription refresh failed", error);
      }
    };
    refreshGoogleEntitlement();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshGoogleEntitlement();
    }, 2 * 60 * 1000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshGoogleEntitlement();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [profile?.id, profile?.role, refreshFisherPremiumEntitlement, session?.access_token]);

  const handleNotificationNavigation = useCallback((payload = {}) => {
    const normalizedPayload = normalizeNotificationNavigationPayload(payload);
    const nextTab = getNotificationRouteTarget(normalizedPayload, profile?.role);
    const linkedConsumerListingId = String(normalizedPayload.consumerListingId || normalizedPayload.listingId || "").trim();
    if (linkedConsumerListingId && profile?.role === "consumer") {
      setConsumerListingId(linkedConsumerListingId);
    }
    if (nextTab) {
      setActiveTab(nextTab);
    }
    if (nextTab === "offers" && profile?.role === "buyer") {
      setBuyerOffersSearch("");
      setBuyerOffersFilter("open");
      if (String(normalizedPayload.eventType || "").trim() === "offer_accepted") {
        setBuyerActiveOfferId(null);
        return;
      }
    }
    if (String(normalizedPayload.offerId || "").trim()) {
      setBuyerActiveOfferId(String(normalizedPayload.offerId).trim());
      setBuyerActionMode("counter");
    }
    if (nextTab === "auctions") {
      const offerId = String(normalizedPayload.offerId || "").trim();
      const batchId = String(normalizedPayload.batchId || "").trim();
      if (offerId || batchId) {
        setPendingAuctionTarget({ offerId, batchId, requestKey: Date.now() });
      }
    }
    if (nextTab === "offers" && String(normalizedPayload.offerId || "").trim()) {
      setPendingOfferTarget({ offerId: String(normalizedPayload.offerId).trim(), requestKey: Date.now() });
    }
  }, [profile?.role]);

  const handleAuctionTargetHandled = useCallback(() => {
    setPendingAuctionTarget(null);
  }, []);

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
          const notificationKey = JSON.stringify([title, body, data?.eventType || "", data?.offerId || "", data?.batchId || "", data?.consumerListingId || data?.listingId || ""]);
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
          const actionPayload = result?.notification?.data || result?.notification?.extra || result?.notification || {};
          console.log("[PUSH] pushNotificationActionPerformed", JSON.stringify(actionPayload));
          handleNotificationNavigation(actionPayload);
        });
        removeHandles.push(actionHandle);

        const localActionHandle = await LocalNotifications.addListener("localNotificationActionPerformed", (result) => {
          if (cancelled) return;
          const actionPayload = result?.notification?.extra || result?.notification?.data || result?.notification || {};
          console.log("[PUSH] localNotificationActionPerformed", JSON.stringify(actionPayload));
          handleNotificationNavigation(actionPayload);
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

  const getMissingBuyerTradeFields = (buyerLike, profileLike) => {
    return getMissingBuyerPurchaseFields(buyerLike, profileLike);
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
    fishermanDeliveryMethods.includes(value) ? value : "Myyjä toimittaa"
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
    const publicLocation = [sellerIdentity.sellerArea || offer?.area || "-", sellerIdentity.municipality || ""]
      .filter((value, index, array) => {
        const normalized = String(value || "").trim();
        if (!normalized) return false;
        return array.findIndex((item) => String(item || "").trim().toLowerCase() === normalized.toLowerCase()) === index;
      })
      .join(", ") || "-";

    return {
      ...sellerIdentity,
      revealIdentity,
      sellerLabel: revealIdentity ? sellerIdentity.sellerName : ANONYMOUS_SELLER_LABEL,
      publicLocation,
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
  const getEntryConsumerListing = (entry) => (consumerListings || []).find((listing) => (
    String(listing.catch_entry_id || "") === String(entry?.id || "")
    || (!listing.catch_entry_id && listing.batch_id && String(listing.batch_id) === String(entry?.batchId || ""))
  )) || null;
  const copyConsumerListingLink = async (listing) => {
    const link = getConsumerListingUrl(listing?.id, getPublicAppBaseUrl());
    try {
      if (!navigator?.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(link);
      setAuthInfo("Kuluttajailmoituksen julkinen linkki kopioitiin.");
    } catch {
      setAuthInfo(`Kuluttajailmoituksen julkinen linkki: ${link}`);
    }
  };
  const openConsumerListingLink = async (listing) => {
    const link = getConsumerListingUrl(listing?.id, getPublicAppBaseUrl());
    try {
      await Browser.open({ url: link });
    } catch {
      window.open(link, "_blank", "noopener,noreferrer");
    }
  };
  const isCatchAuction = form.saleMode === "auction";
  const isConsumerSale = form.saleMode === "consumer";
  const primaryConsumerProductName = formatSpeciesForSale(getSpeciesRowLabel(speciesRows[0]));
  const primaryConsumerNetPrice = parseLocaleNumber(speciesRows[0]?.price_per_kg);
  const primaryConsumerGrossPrice = primaryConsumerNetPrice == null ? null : calculateGrossPrice(primaryConsumerNetPrice);
  useEffect(() => {
    if (!isConsumerSale) return;
    setForm((previous) => {
      let changed = false;
      let nextProductName = previous.consumerProductName;
      let nextProductNameAutoFilled = Boolean(previous.consumerProductNameAutoFilled);

      if (primaryConsumerProductName && (!String(previous.consumerProductName || "").trim() || previous.consumerProductNameAutoFilled)) {
        if (previous.consumerProductName !== primaryConsumerProductName || !previous.consumerProductNameAutoFilled) changed = true;
        nextProductName = primaryConsumerProductName;
        nextProductNameAutoFilled = true;
      } else if (!primaryConsumerProductName && previous.consumerProductNameAutoFilled) {
        changed = true;
        nextProductName = "";
        nextProductNameAutoFilled = false;
      }

      const hasSourcePrice = Number(primaryConsumerGrossPrice) > 0;
      const nextVariants = (previous.consumerVariants || []).map((variant) => {
        const priceField = variant.unitType === "whole_fish" ? "pricePerKg" : "unitPrice";
        const currentPrice = String(variant[priceField] || "");
        if (currentPrice && !variant.priceAutoFilled) return variant;

        const packageSizeKg = variant.unitType === "package" ? parseLocaleNumber(variant.packageSizeKg) : 1;
        const suggestedPrice = hasSourcePrice && Number(packageSizeKg) > 0
          ? formatConsumerPriceInput(Number(primaryConsumerGrossPrice) * Number(packageSizeKg))
          : "";
        if (currentPrice === suggestedPrice && variant.priceAutoFilled === hasSourcePrice) return variant;
        changed = true;
        return { ...variant, [priceField]: suggestedPrice, priceAutoFilled: hasSourcePrice };
      });

      if (!changed) return previous;
      return {
        ...previous,
        consumerProductName: nextProductName,
        consumerProductNameAutoFilled: nextProductNameAutoFilled,
        consumerVariants: nextVariants,
      };
    });
  }, [isConsumerSale, primaryConsumerGrossPrice, primaryConsumerProductName, form.consumerVariants]);
  const currentCalendarYear = Number(today().slice(0, 4));
  const currentInlandGearMeta = getInlandGearMeta(form.inlandGearCode || form.gear);
  const currentInlandTechnicalFields = getInlandGearTechnicalFields(form.inlandGearCode || form.gear);
  const auctionContainsOnlyCrayfish = speciesRows.length > 0 && speciesRows.every((row) => isCrayfishSpecies(getSpeciesRowLabel(row)));
  const shouldSendOffer = hasFisherPremium && form.saleMode === "fixed" && form.listForSale && (
    form.offerAudience === "selected"
      ? form.selectedBuyerIds.length > 0
      : (form.offerToShops || form.offerToRestaurants || form.offerToWholesalers)
  );
  const shouldSendProcessedOffer = processedForm.listForSale && (processedForm.offerToShops || processedForm.offerToRestaurants || processedForm.offerToWholesalers);
  const currentOriginCity = form.originCity || form.municipality || "";
  const currentProcessedOriginCity = processedForm.originCity || processedForm.municipality || "";
  const savedPickupAddress = getDefaultProfilePickupAddress(profile);
  const derivedDeliveryArea = resolveOfferDeliveryArea(
    normalizeFishermanDeliveryMethod(form.deliveryMethod),
    form.deliveryArea,
    form.deliveryDestinations,
    savedPickupAddress,
  );
  const derivedProcessedDeliveryArea = resolveOfferDeliveryArea(
    processedForm.deliveryMethod,
    processedForm.deliveryArea,
    processedForm.deliveryDestinations,
    savedPickupAddress,
  );
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
    const selectedBuyerIds = new Set(
      offerFormState.offerAudience === "selected"
        ? (offerFormState.selectedBuyerIds || []).map(String)
        : [],
    );

    (buyers || [])
      .filter((buyer) => buyer.is_active)
      .forEach((buyer) => {
        const buyerTypes = parseBuyerTypes(buyer.buyer_type);
        const isAllOffersTestBuyer = normalizeEmail(buyer.email) === ALL_OFFERS_TEST_BUYER_EMAIL;
        const isDirectRecipient = selectedBuyerIds.has(String(buyer.id));
        const matchedBuyerType = isDirectRecipient
          ? (buyerTypes[0] || normalizeBuyerType("tukku"))
          : buyerTypes.find((buyerType) => selectedTypes.includes(buyerType))
          || (isAllOffersTestBuyer ? selectedTypes[0] : "");
        if (offerFormState.offerAudience === "selected" && !isDirectRecipient) return;
        if (!matchedBuyerType) return;
        const minKg = getOptionalKgLimit(buyer.min_kg);
        const maxKg = getOptionalKgLimit(buyer.max_kg);
        const minOk = minKg == null || totalKilos >= minKg;
        const maxOk = maxKg == null || totalKilos <= maxKg;
        const allowedDestinations = Array.isArray(offerFormState.deliveryDestinations)
          ? offerFormState.deliveryDestinations
          : [];
        const buyerCity = resolveBuyerDestinationCity(buyer);
        const recipientDestinationCity = isAllOffersTestBuyer
          ? (allowedDestinations[0] || buyerCity)
          : buyerCity;
        const recipient = {
          buyer_id: buyer.id,
          email: buyer.email,
          channel: matchedBuyerType,
          company_name: buyer.company_name,
          contact_name: buyer.contact_name,
          destination_city: recipientDestinationCity,
        };

        if (!isDirectRecipient && !isAllOffersTestBuyer && (!minOk || !maxOk)) {
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
          if (!recipientDestinationCity) {
            excluded.push({
              ...recipient,
              reason: "ostajan toimituskaupunki puuttuu",
            });
            return;
          }

          if (!isAllOffersTestBuyer && !allowedDestinations.includes(recipientDestinationCity)) {
            excluded.push({
              ...recipient,
              reason: `kohde ${recipientDestinationCity} ei kuulu valittuihin toimituskohteisiin`,
            });
            return;
          }

          const routePrice = getRoutePrice(offerFormState.originPointId, recipientDestinationCity, totalKilos);
          if (!routePrice) {
            if (isAllOffersTestBuyer) {
              matching.push(recipient);
              return;
            }
            excluded.push({
              ...recipient,
              reason: `reittihintaa ei löydy kohteeseen ${recipientDestinationCity}`,
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
    setConsumerListings([]);
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
    if (!isNativeCapacitorApp()) return undefined;

    const openPasswordRecovery = (recoverySession) => {
      setSession(recoverySession ?? null);
      setAuthMode("recovery");
      setAuthError("");
      setAuthInfo("Aseta uusi salasana jatkaaksesi.");
      setAuthForm((prev) => ({
        ...prev,
        email: (recoverySession?.user?.email || prev.email || "").trim().toLowerCase(),
        password: "",
        confirmPassword: "",
      }));
    };

    const showPasswordRecoveryError = (message) => {
      setAuthMode("signin");
      setAuthInfo("");
      setAuthError(`Salasanan palautuslinkkiä ei voitu avata. Pyydä uusi linkki. (${message})`);
    };

    const urlHandlers = {
      setActiveTab,
      setBuyerActiveOfferId,
      setPublicBatchId,
      setConsumerListingId,
    };

    const handleIncomingUrl = async (url) => {
      await consumeIncomingPasswordRecoveryUrl(url, {
        onRecoveryReady: openPasswordRecovery,
        onRecoveryError: showPasswordRecoveryError,
      });
      applyIncomingAppUrl(url, urlHandlers);
    };

    const handleInitialUrl = async () => {
      try {
        const launchUrl = await CapacitorApp.getLaunchUrl();
        const initialUrl = String(launchUrl?.url || "").trim();
        if (initialUrl) {
          await handleIncomingUrl(initialUrl);
        }
      } catch {
        // ignore launch URL lookup failure
      }
    };

    void handleInitialUrl();

    let listenerHandle = null;
    const registerListener = async () => {
      try {
        listenerHandle = await CapacitorApp.addListener("appUrlOpen", ({ url }) => {
          const nextUrl = String(url || "").trim();
          if (nextUrl) {
            void handleIncomingUrl(nextUrl);
          }
        });
      } catch {
        listenerHandle = null;
      }
    };

    void registerListener();

    return () => {
      if (listenerHandle?.remove) {
        void listenerHandle.remove();
      }
    };
  }, [setActiveTab, setBuyerActiveOfferId]);

  const closePublicBatchView = useCallback(() => {
    leavePublicBatchView();
    setPublicBatchId("");
    setPublicBatchData(null);
    setPublicBatchLoading(false);
    setPublicBatchError("");
  }, []);

  useEffect(() => {
    if (!publicBatchId || !isNativeCapacitorApp()) return undefined;

    let listenerHandle = null;
    const registerBackButtonListener = async () => {
      try {
        listenerHandle = await CapacitorApp.addListener("backButton", closePublicBatchView);
      } catch {
        listenerHandle = null;
      }
    };

    void registerBackButtonListener();
    return () => {
      if (listenerHandle?.remove) {
        void listenerHandle.remove();
      }
    };
  }, [publicBatchId, closePublicBatchView]);

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
      setConsumerListings([]);
      setProcessedEntries([]);
      setOffers([]);
      setAllowedUsers([]);
      setPendingProfiles([]);
      return;
    }

    const ensureProfile = async (attempt = 0) => {
      const email = (session.user.email || "").trim().toLowerCase();
      const { data: allowedRows, error: allowedError } = await findAllowedUsersByEmail(supabase, email);
      if (allowedError && allowedError.code !== "PGRST116") {
        if (isMissingRefreshTokenError(allowedError)) {
          await invalidateSession();
          return;
        }
        if (isFutureJwtClockSkewError(allowedError) && attempt < 2) {
          await waitForRetry(700 * (attempt + 1));
          return ensureProfile(attempt + 1);
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
        // Automaattisesti aktiivinen profiili ei tarvitse kirjautumisen
        // yhteydessä selainpuolen kirjoitusta allowed_users-tauluun.
        // Käyttöoikeusrivit luodaan ja päivitetään vain palvelinpuolella tai
        // admin-näkymässä, jotta RLS-suojaus ei aiheuta käyttäjälle virheitä.
      };

      const { data: existingProfile, error: profileError } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
      if (profileError && profileError.code !== "PGRST116") {
        if (isMissingRefreshTokenError(profileError)) {
          await invalidateSession();
          return;
        }
        if (isFutureJwtClockSkewError(profileError) && attempt < 2) {
          await waitForRetry(700 * (attempt + 1));
          return ensureProfile(attempt + 1);
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
          : session.user.user_metadata?.requested_role === "consumer"
            ? "consumer"
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
        if (isFutureJwtClockSkewError(insertError) && attempt < 2) {
          await waitForRetry(700 * (attempt + 1));
          return ensureProfile(attempt + 1);
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

    const loadData = async (attempt = 0) => {
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
          hasAuctionsTable,
        ] = await Promise.all([
          tableExists(supabase, "wholesale_offers"),
          tableExists(supabase, "buyers"),
          tableExists(supabase, "processed_batches"),
          tableExists(supabase, "processed_products"),
          tableExists(supabase, "processed_batch_sources"),
          tableExists(supabase, "buyer_offers"),
          tableExists(supabase, "app_push_tokens"),
          tableExists(supabase, "auctions"),
        ]);
        // Huutokaupat ovat pysyvä osa nykyistä tietokantarakennetta. Androidin
        // CapacitorHttp voi epäonnistua HEAD-pohjaisessa tableExists-
        // tarkistuksessa, vaikka taulu on olemassa, jolloin välilehti
        // piiloutuisi virheellisesti.
        setAuctionsAvailable(true);

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
        const consumerListingsPromise = profile.role === "member"
          ? supabase
              .from("consumer_listings")
              .select("id, catch_entry_id, batch_id, status")
              .eq("seller_user_id", profile.id)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null });

        const [
          { data: entryData, error: entryError },
          consumerListingsResult,
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
          consumerListingsPromise,
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

        const transientLoadError = [
          entryError,
          consumerListingsResult?.error,
          processedEntriesResult?.error,
          processedProductsResult?.error,
          allowedError,
          ownerProfilesResult?.error,
          appPushTokensResult?.error,
          offerResult?.error,
          buyersResult?.error,
          buyerOffersResult?.error,
          processorAcceptedOffersResult?.error,
        ].find(isTransientFetchError);

        if (transientLoadError && attempt < 2) {
          await waitForRetry(700 * (attempt + 1));
          return loadData(attempt + 1);
        }

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
            icesSubdivision: entry.ices_subdivision || "",
            statisticalRectangle: entry.statistical_rectangle || "",
            marineGearCode: entry.marine_gear_code || "",
            marineGearName: entry.marine_gear_name || "",
            vesselLengthClass: entry.vessel_length_class || "",
            fishingDayId: entry.fishing_day_id || "",
            releasedCatchDetails: entry.released_catch_details || "",
            incidentalBycatchDetails: entry.incidental_bycatch_details || "",
            lostGearDetails: entry.lost_gear_details || "",
            inlandGearCode: entry.inland_gear_code || getInlandGearCode(entry.gear),
            managementFishing: Boolean(entry.management_fishing) || String(entry.gear || "").startsWith("Hoitokalastus "),
            fishingWithoutVessel: Boolean(entry.fishing_without_vessel),
            effortOnly: Boolean(entry.effort_only),
            gearCount: entry.gear_count || extractCatchLogisticsDetailsFromNotes(entry.notes).gearCount || "",
            fishingDurationDays: entry.fishing_effort || extractCatchLogisticsDetailsFromNotes(entry.notes).fishingDurationDays || "",
            fishingSecondaryValue: entry.fishing_secondary_value || "",
            netMeshSize: entry.gear_mesh_size || extractCatchGearDetailsFromNotes(entry.notes).netMeshSize || "",
            netHeight: entry.gear_height || extractCatchGearDetailsFromNotes(entry.notes).netHeight || "",
            gearLength: entry.gear_length || "",
            gearWidth: entry.gear_width || "",
            otherGearName: entry.other_gear_name || "",
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
            offerRestricted: Boolean(entry.offer_restricted),
          })));
        }

        if (consumerListingsResult?.error && consumerListingsResult.error.code !== "PGRST116") {
          if (isMissingRefreshTokenError(consumerListingsResult.error)) {
            await invalidateSession();
            return;
          }
          setAuthError(consumerListingsResult.error.message);
          setConsumerListings([]);
        } else {
          setConsumerListings(consumerListingsResult?.data || []);
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
                icesSubdivision: entry.ices_subdivision || "",
                statisticalRectangle: entry.statistical_rectangle || "",
                marineGearCode: entry.marine_gear_code || "",
                marineGearName: entry.marine_gear_name || "",
                vesselLengthClass: entry.vessel_length_class || "",
                fishingDayId: entry.fishing_day_id || "",
                releasedCatchDetails: entry.released_catch_details || "",
                incidentalBycatchDetails: entry.incidental_bycatch_details || "",
                lostGearDetails: entry.lost_gear_details || "",
                inlandGearCode: entry.inland_gear_code || getInlandGearCode(entry.gear),
                managementFishing: Boolean(entry.management_fishing) || String(entry.gear || "").startsWith("Hoitokalastus "),
                fishingWithoutVessel: Boolean(entry.fishing_without_vessel),
                effortOnly: Boolean(entry.effort_only),
                gearCount: entry.gear_count || extractCatchLogisticsDetailsFromNotes(entry.notes).gearCount || "",
                fishingDurationDays: entry.fishing_effort || extractCatchLogisticsDetailsFromNotes(entry.notes).fishingDurationDays || "",
                fishingSecondaryValue: entry.fishing_secondary_value || "",
                netMeshSize: entry.gear_mesh_size || extractCatchGearDetailsFromNotes(entry.notes).netMeshSize || "",
                netHeight: entry.gear_height || extractCatchGearDetailsFromNotes(entry.notes).netHeight || "",
                gearLength: entry.gear_length || "",
                gearWidth: entry.gear_width || "",
                otherGearName: entry.other_gear_name || "",
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
                offerRestricted: Boolean(entry.offer_restricted),
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
          let resolvedAllowedUsers = deduplicateAllowedUsers(allowedData || []);

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
                .upsert(missingAllowedPayloads, {
                  onConflict: "email,role,buyer_id",
                  ignoreDuplicates: true,
                })
                .select("*");

              if (insertAllowedError) {
                if (isMissingRefreshTokenError(insertAllowedError)) {
                  await invalidateSession();
                  return;
                }
                setAuthError(insertAllowedError.message);
              } else if (Array.isArray(insertedAllowedRows) && insertedAllowedRows.length > 0) {
                resolvedAllowedUsers = deduplicateAllowedUsers([...resolvedAllowedUsers, ...insertedAllowedRows]);
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

        const buyersData = (buyersResult?.data || [])
          .filter((buyer) => !String(buyer.notes || "").includes("[SYSTEM_ARCHIVED_BUYER:"))
          .map((buyer) => ({
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
        setAuthError((current) => isTransientFetchError(current) ? "" : current);
      } catch (error) {
        if (isMissingRefreshTokenError(error)) {
          await invalidateSession();
          return;
        }
        if (isTransientFetchError(error) && attempt < 2) {
          await waitForRetry(700 * (attempt + 1));
          return loadData(attempt + 1);
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

  const openAccountDetails = () => {
    setAccountPanelOpen(true);
    window.setTimeout(() => {
      document.getElementById("account-details-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
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
        inlandGearPresets: savedInlandGearPresets,
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
    savedInlandGearPresets,
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
        totalPieces: 0,
        forSaleKilos: 0,
        forSalePieces: 0,
        speciesSummary: new Map(),
      };

      existingGroup.entries.push(entry);
      const speciesKey = formatSpeciesForSale(entry.species);
      const crayfish = isCrayfishSpecies(entry.species);
      const quantity = crayfish ? Number(entry.count || 0) : Number(entry.kilos || 0);
      const unit = crayfish ? "kpl" : "kg";
      if (crayfish) {
        existingGroup.totalPieces += quantity;
      } else {
        existingGroup.totalKilos += quantity;
      }
      const previousSpecies = existingGroup.speciesSummary.get(speciesKey);
      existingGroup.speciesSummary.set(speciesKey, {
        species: speciesKey,
        quantity: Number(previousSpecies?.quantity || 0) + quantity,
        unit,
      });
      if (entry.offerToShops || entry.offerToRestaurants || entry.offerToWholesalers || entry.offerRestricted) {
        if (crayfish) {
          existingGroup.forSalePieces += quantity;
        } else {
          existingGroup.forSaleKilos += quantity;
        }
      }

      acc.set(monthKey, existingGroup);
      return acc;
    }, new Map());

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        speciesSummary: Array.from(group.speciesSummary.values())
          .sort((a, b) => b.quantity - a.quantity),
      }))
      .sort((a, b) => b.key.localeCompare(a.key));
  }, [filteredEntries]);

  const saleEntries = useMemo(() => entries.filter((entry) => entry.offerToShops || entry.offerToRestaurants || entry.offerToWholesalers || entry.offerRestricted), [entries]);
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
    const totalPieces = entries.filter((e) => isCrayfishSpecies(e.species)).reduce((sum, e) => sum + Number(e.count || 0), 0);
    const forSaleKg = saleEntries.reduce((sum, e) => sum + Number(e.kilos || 0), 0);
    const forSalePieces = saleEntries.filter((e) => isCrayfishSpecies(e.species)).reduce((sum, e) => sum + Number(e.count || 0), 0);
    const totalProcessedKg = processedEntries.reduce((sum, e) => sum + Number(e.kilos || 0), 0);
    const processedForSaleKg = processedSaleEntries.reduce((sum, e) => sum + Number(e.kilos || 0), 0);
    const speciesSummary = Array.from(new Set([...fishSpecies.filter((species) => species !== "Muu"), ...entries.map((entry) => entry.species).filter(Boolean)]))
      .map((species) => {
        const crayfish = isCrayfishSpecies(species);
        return {
          species,
          quantity: entries
            .filter((e) => e.species === species)
            .reduce((sum, e) => sum + Number(crayfish ? e.count || 0 : e.kilos || 0), 0),
          unit: crayfish ? "kpl" : "kg",
        };
      })
      .filter((item) => item.quantity > 0)
      .sort((a, b) => b.quantity - a.quantity);
    const processedSummary = processedProductTypes
      .map((productType) => ({ productType, kilos: processedEntries.filter((e) => e.productType === productType).reduce((sum, e) => sum + Number(e.kilos || 0), 0) }))
      .filter((item) => item.kilos > 0)
      .sort((a, b) => b.kilos - a.kilos);
    return { totalKg, totalPieces, forSaleKg, forSalePieces, totalProcessedKg, processedForSaleKg, speciesSummary, processedSummary };
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
        if (isTransientFetchError(errorMessage)) {
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
      const requestedRole = authForm.requestedRole === "buyer" ? "buyer" : authForm.requestedRole === "processor" ? "processor" : authForm.requestedRole === "consumer" ? "consumer" : "member";
      if (!email || !password || !displayName) {
        setAuthError("Täytä sähköposti, salasana ja nimi.");
        return;
      }
      if (!authForm.acceptedTerms) {
        setAuthError("Hyväksy käyttöehdot ja tietosuojaseloste ennen tunnuksen luomista.");
        return;
      }
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName,
            requested_role: requestedRole,
            legal_terms_version: LEGAL_TERMS_VERSION,
            legal_terms_accepted_at: new Date().toISOString(),
          },
        },
      });
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
      const redirectTo = `${getPublicAppBaseUrl()}/?recovery=1`;
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

  const handleDeleteOwnAccount = async () => {
    if (!isAppleStoreKitAvailable() || accountDeletionBusy) return;

    const firstConfirmation = window.confirm(
      "Haluatko varmasti poistaa käyttäjätilisi? Poisto on pysyvä, eikä poistettuja saalis-, tarjous- tai profiilitietoja voi palauttaa. Lakisääteisesti säilytettävät kauppatiedot voidaan säilyttää anonymisoituina.",
    );
    if (!firstConfirmation) return;

    const finalConfirmation = window.confirm(
      "Vahvista vielä käyttäjätilin pysyvä poistaminen. Mahdollinen App Store -tilaus täytyy lopettaa erikseen Applen tilausten hallinnasta.",
    );
    if (!finalConfirmation) return;

    setAuthError("");
    setAuthInfo("");
    setAccountDeletionBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error("Istunto puuttuu. Kirjaudu uudelleen sisään.");

      const { error } = await invokeDeleteOwnAccount(accessToken);
      if (error) {
        if (error.status === 401) {
          await invalidateSession();
          return;
        }
        throw new Error(error.message || "Käyttäjätilin poistaminen epäonnistui.");
      }

      currentPushTokenRef.current = "";
      await clearBrokenSession();
      setProfile(null);
      setSession(null);
      setAvailableRoleOptions([]);
      setRoleSelectionOpen(false);
      setAccountPanelOpen(false);
      setAuthMode("signin");
      setAuthInfo("Käyttäjätilisi on poistettu pysyvästi.");
    } catch (error) {
      setAuthError(String(error?.message || error || "Käyttäjätilin poistaminen epäonnistui."));
    } finally {
      setAccountDeletionBusy(false);
    }
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
        eviraFacilityId: accountForm.eviraFacilityId.trim(),
        contactName: accountForm.contactName.trim(),
        deliveryAddress: accountForm.deliveryAddress.trim(),
        deliveryPostcode: accountForm.deliveryPostcode.trim(),
        deliveryCity: accountForm.deliveryCity.trim(),
        notes: accountForm.notes.trim(),
      };
      const buyerPayload = profile.role === "buyer" ? {
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
      } : null;
      if (profile.role === "buyer" && !buyerPayload.company_name) {
        setAuthError("Täytä yrityksen nimi.");
        return;
      }

      let resolvedBuyerRecord = linkedBuyerRecord;
      if (profile.role === "buyer" && !resolvedBuyerRecord?.id) {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token;
        if (!accessToken) throw new Error("Istunto puuttuu. Kirjaudu uudelleen sisään.");
        const { data: ensureData, error: ensureError } = await invokeEdgeFunctionAuthenticated(
          "ensure-buyer-profile",
          buyerPayload,
          accessToken,
        );
        if (ensureError) throw new Error(ensureError.message);
        resolvedBuyerRecord = ensureData?.buyer || null;
        if (!resolvedBuyerRecord?.id) throw new Error("Ostajaprofiilia ei voitu luoda.");
      }
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
              evira_facility_id: accountForm.eviraFacilityId.trim() || null,
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
          : resolvedBuyerRecord?.id
            ? { buyer_id: resolvedBuyerRecord.id }
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

      if (profile.role === "buyer" && resolvedBuyerRecord?.id) {
        const { data: updatedBuyerRecord, error: buyerUpdateError } = await supabase
          .from("buyers")
          .update(buyerPayload)
          .eq("id", resolvedBuyerRecord.id)
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
        setBuyers((prev) => {
          const normalizedBuyer = { ...updatedBuyerRecord, email: normalizeEmail(updatedBuyerRecord.email || profile.email || "") };
          return prev.some((buyer) => String(buyer.id) === String(updatedBuyerRecord.id))
            ? prev.map((buyer) => (String(buyer.id) === String(updatedBuyerRecord.id) ? { ...buyer, ...normalizedBuyer } : buyer))
            : [...prev, normalizedBuyer];
        });
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
      auction_email_enabled: true,
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
      auction_email_enabled: buyer.auction_email_enabled !== false,
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
    setBuyers((previousBuyers) => previousBuyers.filter((item) => item.id !== buyer.id));
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
      auction_email_enabled: buyerForm.auction_email_enabled !== false,
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

    const nextValue = !Boolean(linkedProfile?.fisher_premium_admin_enabled);
    const { error } = await supabase
      .from("profiles")
      .update({ fisher_premium_admin_enabled: nextValue })
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
    const resolvedDeliveryArea = resolveOfferDeliveryArea(
      formState.deliveryMethod,
      formState.deliveryArea,
      formState.deliveryDestinations,
      getDefaultProfilePickupAddress(profileState),
    );

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
      `Toimitusalue: ${resolvedDeliveryArea || "-"}`,
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
        scientific_name: getSpeciesMetadata(getSpeciesRowLabel(row))?.scientific || "",
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
      deliveryArea: resolvedDeliveryArea,
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
          delivery_area: resolvedDeliveryArea || null,
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
    const resolvedDeliveryArea = resolveOfferDeliveryArea(
      formState.deliveryMethod,
      formState.deliveryArea,
      formState.deliveryDestinations,
      getDefaultProfilePickupAddress(profileState),
    );

    const logisticsLines = [
      `Hinta: ${formState.price_per_kg !== "" && formState.price_per_kg != null ? `${formState.price_per_kg} € / kg` : "-"}`,
      `Toimitustapa: ${formState.deliveryMethod || "-"}`,
      `Toimitusalue: ${resolvedDeliveryArea || "-"}`,
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
      deliveryArea: resolvedDeliveryArea,
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
          delivery_area: resolvedDeliveryArea || null,
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

  const handleUpdateSellerBillingStatus = async (offer, billingStatus, { announce = true } = {}) => {
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

    if (announce) {
      setAuthInfo(
        billingStatus === "paid"
          ? "Lasku merkitty maksetuksi."
          : billingStatus === "invoiced"
          ? "Lasku merkitty laskutetuksi."
          : "Lasku palautettu laskuttamattomaksi."
      );
    }
    setRefreshTick((prev) => prev + 1);
  };

  const handleUpdateSellerGroupBillingStatus = async (offers, billingStatus, { announce = true } = {}) => {
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

    if (announce) {
      setAuthInfo(
        billingStatus === "paid"
          ? "Kaikki ryhmän laskut merkitty maksetuiksi."
          : billingStatus === "invoiced"
          ? "Kaikki ryhmän laskut merkitty laskutetuiksi."
          : "Kaikki ryhmän laskut palautettu laskuttamattomiksi."
      );
    }
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

  const handleCreateDeliveryNote = async (offer, entry, format = DELIVERY_NOTE_FORMATS.A4) => {
    try {
      setAuthError("");
      const payload = buildDeliveryNotePayload(offer, entry, profile);
      if (!payload.recipient.address || payload.recipient.address === "-") {
        setAuthError("Lähetyslistaa ei voi luoda, koska ostajan toimitusosoite puuttuu.");
        return;
      }
      const { doc, fileName } = createDeliveryNotePdf(payload, format);
      await presentPdfDocument(doc, fileName, {
        browserAction: "open",
        dedupeKey: `delivery-note-${String(offer?.id || offer?.batch_id || "sale")}-${format}`,
      });
    } catch (error) {
      console.error("Lähetyslistan luonti epäonnistui:", error);
      setAuthError(error?.message || "Lähetyslistan luonti epäonnistui.");
    }
  };

  const handleCreateAuctionDeliveryNote = async (auction, format = DELIVERY_NOTE_FORMATS.A4) => {
    try {
      setAuthError("");
      const payload = buildAuctionDeliveryNotePayload(auction, profile);
      if (!payload.recipient.address || payload.recipient.address === "-") {
        setAuthError("Lähetyslistaa ei voi luoda, koska huutokaupan voittajan toimitusosoite puuttuu.");
        return;
      }
      const { doc, fileName } = createDeliveryNotePdf(payload, format);
      await presentPdfDocument(doc, fileName, {
        browserAction: "open",
        dedupeKey: `auction-delivery-note-${String(auction?.id || auction?.batch_id || "sale")}-${format}`,
      });
    } catch (error) {
      console.error("Huutokaupan lähetyslistan luonti epäonnistui:", error);
      setAuthError(error?.message || "Lähetyslistan luonti epäonnistui.");
    }
  };

  const handleViewSellerInvoicePdf = async (offer) => {
    if (!profile?.bank_account_iban) {
      setAuthError("Lisää IBAN pankkitietoihin ennen lasku-PDF:n avaamista.");
      return;
    }
    setAuthError("");
    const targetWindow = openPendingPdfWindow();
    if (!targetWindow && typeof window !== "undefined" && !isNativeCapacitorApp()) {
      setAuthError("Selain esti lasku-PDF:n avauksen. Salli ponnahdusikkunat tälle sivulle ja yritä uudelleen.");
      return;
    }
    await openSellerInvoicePdf(offer, profile, {
      targetWindow,
      dedupeKey: `seller-invoice-view-${String(offer?.id || offer?.batch_id || "invoice")}`,
    });
  };

  const buildBuyerInvoiceSellerProfileLike = (offer) => ({
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
    });

  const handleOpenBuyerInvoicePdf = async (offer) => {
    const sellerProfileLike = buildBuyerInvoiceSellerProfileLike(offer);

    if (!sellerProfileLike.bank_account_iban) {
      setAuthError("Laskun PDF ei ole vielä saatavilla tälle kaupalle, koska kalastajan tilinumero puuttuu laskutiedoista.");
      return;
    }

    setAuthError("");
    setAuthInfo("Muodostetaan lasku-PDF...");
    const targetWindow = openPendingPdfWindow();
    if (!targetWindow && typeof window !== "undefined" && !isNativeCapacitorApp()) {
      setAuthInfo("");
      setAuthError("Selain esti lasku-PDF:n avauksen. Salli ponnahdusikkunat tälle sivulle ja yritä uudelleen.");
      return;
    }
    try {
      await openSellerInvoicePdf(offer, sellerProfileLike, {
        targetWindow,
        dedupeKey: `buyer-invoice-view-${String(offer?.id || offer?.batch_id || "invoice")}`,
      });
      setAuthInfo(isNativeCapacitorApp()
        ? "Lasku-PDF on valmis. Avaa tai jaa se avautuneesta valikosta."
        : "Lasku-PDF avattiin uuteen välilehteen.");
    } catch (error) {
      if (targetWindow && !targetWindow.closed) {
        try {
          targetWindow.close();
        } catch {
          // ignore close failures
        }
      }
      setAuthInfo("");
      setAuthError(`Lasku-PDF:n avaaminen epäonnistui: ${String(error?.message || error)}`);
    }
  };

  const handleOpenBuyerGroupInvoicePdf = async (offers) => {
    const targetOffers = Array.isArray(offers) ? offers.filter(Boolean) : [];
    if (targetOffers.length === 0) return;

    const sellerProfileLike = buildBuyerInvoiceSellerProfileLike(targetOffers[0]);
    if (!sellerProfileLike.bank_account_iban) {
      setAuthError("Koontilaskun PDF ei ole vielä saatavilla, koska kalastajan tilinumero puuttuu laskutiedoista.");
      return;
    }

    setAuthError("");
    setAuthInfo("Muodostetaan koontilaskun PDF...");
    const targetWindow = openPendingPdfWindow();
    if (!targetWindow && typeof window !== "undefined" && !isNativeCapacitorApp()) {
      setAuthInfo("");
      setAuthError("Selain esti lasku-PDF:n avauksen. Salli ponnahdusikkunat tälle sivulle ja yritä uudelleen.");
      return;
    }

    try {
      await openSellerGroupInvoicePdf(targetOffers, sellerProfileLike, {
        targetWindow,
        dedupeKey: `buyer-group-invoice-view-${targetOffers.map((offer) => String(offer?.id || "")).join("-")}`,
      });
      setAuthInfo(isNativeCapacitorApp()
        ? "Koontilaskun PDF on valmis. Avaa tai jaa se avautuneesta valikosta."
        : "Koontilaskun PDF avattiin uuteen välilehteen.");
    } catch (error) {
      if (targetWindow && !targetWindow.closed) {
        try {
          targetWindow.close();
        } catch {
          // ignore close failures
        }
      }
      setAuthInfo("");
      setAuthError(`Koontilasku-PDF:n avaaminen epäonnistui: ${String(error?.message || error)}`);
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
      await handleUpdateSellerBillingStatus(offer, "invoiced", { announce: false });
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
      await handleUpdateSellerGroupBillingStatus(offers, "invoiced", { announce: false });
      await sendPushEvent({
        targetBuyerId: offers?.[0]?.buyer_id || "",
        title: "Uusi koontilasku",
        body: `${offers?.[0]?.seller_name || "Myyjä"} lähetti koontilaskun ${attachment.invoice.invoiceNumber}.`,
        eventType: "invoice_sent",
        route: "billing",
        offerId: offers?.[0]?.id,
        batchId: offers?.[0]?.batch_id,
      });
      setAuthInfo(`Koontilasku ${attachment.invoice.invoiceNumber} lähetetty asiakkaalle PDF-liitteenä.${copyResult.statusText}`);
      return;
    }

    await sendPushEvent({
      targetBuyerId: offers?.[0]?.buyer_id || "",
      title: "Koontimaksumuistutus",
      body: `${offers?.[0]?.seller_name || "Myyjä"} lähetti koontimaksumuistutuksen ${attachment.invoice.invoiceNumber}.`,
      eventType: "payment_reminder_sent",
      route: "billing",
      offerId: offers?.[0]?.id,
      batchId: offers?.[0]?.batch_id,
    });
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
    const { error } = await updateBuyerOfferWithCompatFallback(offerId, patch);
    if (error) return { ok: false, error };
    return { ok: true };
  };

  const runBuyerOfferMutation = async ({ action, offer, payload, fallbackPatch, skipRefresh = false, applyLocalOfferUpdate = null }) => {
    let result = null;

    setAuthError("");

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
      if (!shouldFallbackBuyerOfferMutation(result.error)) {
        setAuthError(result.error.message || "Ostajan toiminnon päivitys epäonnistui.");
        return false;
      }
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
      setAuthError("");
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
    setAuthError("");
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
      skipRefresh: true,
      applyLocalOfferUpdate: () => {
        setBuyerOffers((current) => current.map((item) => (
          item.id === offer.id
            ? { ...item, status: "viewed" }
            : item
        )));
      },
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
      skipRefresh: true,
      applyLocalOfferUpdate: () => {
        setBuyerOffers((current) => current.map((item) => (
          item.id === offer.id
            ? { ...item, ...reservePatch }
            : item
        )));
      },
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
      await refreshBuyerOffers();
      setRefreshTick((prev) => prev + 1);
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
      skipRefresh: true,
      applyLocalOfferUpdate: () => {
        setBuyerOffers((current) => current.map((item) => (
          item.id === offer.id
            ? { ...item, status: "rejected" }
            : item
        )));
      },
    });
    if (ok) {
      setBuyerActiveOfferId((current) => (current === offer.id ? null : current));
      await sendBuyerResponseEmail({ ...offer, status: "rejected" }, "Ostaja hylkäsi tarjouksen");
      await refreshBuyerOffers();
      setRefreshTick((prev) => prev + 1);
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

  const deleteBuyerOffersForEntries = async (targetEntries, options = {}) => {
    const entriesToClean = Array.isArray(targetEntries) ? targetEntries.filter(Boolean) : [targetEntries].filter(Boolean);
    if (entriesToClean.length === 0) return { error: null };

    const uniqueEntries = Array.from(
      new Map(
        entriesToClean.map((entry) => [String(entry.id || entry.batchId || `${entry.ownerUserId}:${entry.area}:${entry.spot}:${entry.kilos}`), entry]),
      ).values(),
    );

    const results = await Promise.all(uniqueEntries.map(async (entry) => {
      let query = supabase
        .from("buyer_offers")
        .delete()
        .eq("seller_user_id", entry.ownerUserId || profile?.id || "");

      if (options.onlyOpen) {
        query = query.in("status", BUYER_OFFER_COMPETING_OPEN_STATUSES);
      }

      const batchId = String(entry.batchId || "").trim();
      if (batchId) {
        return query.eq("batch_id", batchId);
      }

      return query
        .eq("area", entry.area || "")
        .eq("spot", entry.spot || "")
        .eq("total_kilos", Number(entry.kilos || 0));
    }));

    const firstError = results.find((result) => result?.error)?.error || null;
    return { error: firstError };
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
    if (!isProcessedEntry) updatePayload.offer_restricted = false;

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

    const { error: buyerOfferDeleteError } = await deleteBuyerOffersForEntries(targetEntries, { onlyOpen: true });

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

  const openCatchSaleDialog = (entry) => {
    if (!entry || isEntryOfferedForSale(entry) || getEntryConsumerListing(entry)) return;
    if (profile?.role === "member" && !hasFisherPremium) {
      showFisherPremiumRequired("Kalaerän laittaminen myyntiin");
      return;
    }
    setAuthError("");
    setAuthInfo("");
    setCatchSaleEntry(entry);
    setCatchSaleDraft(createCatchSaleDraft(entry));
  };

  const closeCatchSaleDialog = () => {
    if (catchSaleSaving) return;
    setCatchSaleEntry(null);
    setCatchSaleDraft(createCatchSaleDraft());
  };

  const handlePutSavedCatchOnSale = async () => {
    if (!catchSaleEntry || catchSaleSaving) return;
    const pricePerKg = parseLocaleNumber(catchSaleDraft.pricePerKg);
    if (pricePerKg == null || pricePerKg <= 0) {
      setAuthError("Täytä kalaerälle myyntihinta.");
      return;
    }
    if (!String(catchSaleDraft.packaging || "").trim()) {
      setAuthError("Valitse, miten kalaerä on pakattu.");
      return;
    }
    if (catchSaleDraft.offerAudience === "selected" && catchSaleDraft.selectedBuyerIds.length === 0) {
      setAuthError("Valitse vähintään yksi ostaja, jolle tarjous lähetetään.");
      return;
    }
    if (catchSaleDraft.offerAudience !== "selected" && !catchSaleDraft.offerToShops && !catchSaleDraft.offerToRestaurants && !catchSaleDraft.offerToWholesalers) {
      setAuthError("Valitse vähintään yksi ostajaryhmä tai vain tietyt ostajat.");
      return;
    }
    const missingSellerSaleFields = getMissingSellerSaleFields(profile);
    if (missingSellerSaleFields.length > 0) {
      setAccountPanelOpen(true);
      setAuthError(`Täytä omat tiedot ennen kuin voit asettaa kalaerän myyntiin. Puuttuu: ${missingSellerSaleFields.join(", ")}.`);
      return;
    }

    const resolvedSaleArea = catchSaleDraft.deliveryMethod === "Nouto"
      ? (String(catchSaleDraft.deliveryArea || "").trim() || getDefaultProfilePickupAddress(profile))
      : String(catchSaleDraft.deliveryArea || "").trim();
    if (!resolvedSaleArea) {
      setAuthError(catchSaleDraft.deliveryMethod === "Nouto" ? "Täytä nouto-osoite." : "Täytä toimitusalue.");
      return;
    }

    const notesWithoutPackaging = String(catchSaleEntry.notes || "")
      .split("\n")
      .filter((line) => !line.trim().startsWith("Pakkaustapa:"))
      .join("\n")
      .trim();
    const notes = [notesWithoutPackaging, `Pakkaustapa: ${String(catchSaleDraft.packaging).trim()}`].filter(Boolean).join("\n");
    const selectedForGroups = catchSaleDraft.offerAudience !== "selected";
    const updatePayload = {
      offer_to_shops: selectedForGroups && catchSaleDraft.offerToShops,
      offer_to_restaurants: selectedForGroups && catchSaleDraft.offerToRestaurants,
      offer_to_wholesalers: selectedForGroups && catchSaleDraft.offerToWholesalers,
      offer_restricted: !selectedForGroups,
      price_per_kg: pricePerKg,
      notes,
      delivery_possible: false,
      delivery_method: catchSaleDraft.deliveryMethod,
      delivery_area: resolvedSaleArea,
      delivery_cost: parseLocaleNumber(catchSaleDraft.deliveryCost),
      earliest_delivery_date: catchSaleDraft.earliestDeliveryDate || null,
      cold_transport: Boolean(catchSaleDraft.coldTransport),
    };
    const offerFormState = {
      date: catchSaleEntry.date,
      area: catchSaleEntry.area,
      municipality: catchSaleEntry.municipality || "",
      originCity: catchSaleEntry.municipality || "",
      spot: catchSaleEntry.spot || "",
      gear: catchSaleEntry.gear || "",
      notes,
      listForSale: true,
      offerAudience: catchSaleDraft.offerAudience,
      selectedBuyerIds: catchSaleDraft.selectedBuyerIds,
      offerToShops: updatePayload.offer_to_shops,
      offerToRestaurants: updatePayload.offer_to_restaurants,
      offerToWholesalers: updatePayload.offer_to_wholesalers,
      deliveryPossible: false,
      deliveryMethod: catchSaleDraft.deliveryMethod,
      transportMode: "",
      originPointId: "",
      transportCompanyId: "",
      pickupSurcharge: "",
      estimatedPickupTime: "",
      deliveryDestinations: [],
      deliveryArea: resolvedSaleArea,
      deliveryCost: catchSaleDraft.deliveryCost,
      earliestDeliveryDate: catchSaleDraft.earliestDeliveryDate,
      coldTransport: Boolean(catchSaleDraft.coldTransport),
    };
    const offerRows = [{
      species: catchSaleEntry.species,
      kilos: Number(catchSaleEntry.kilos || 0),
      count: Number(catchSaleEntry.count || 0),
      price_per_kg: pricePerKg,
      batch_id: catchSaleEntry.batchId || "",
    }];

    setCatchSaleSaving(true);
    let entryUpdated = false;
    try {
      const { error: updateError } = await supabase.from("catch_entries").update(updatePayload).eq("id", catchSaleEntry.id);
      if (updateError) throw updateError;
      entryUpdated = true;
      const emailResult = await sendCatchOfferEmail({ formState: offerFormState, rows: offerRows, profileState: profile });
      if (emailResult.skipped) {
        setAuthInfo("Kalaerä asetettiin myyntiin, mutta yhtään ostajaa ei täyttänyt tarjousehtoja.");
      } else if (emailResult.failed.length > 0) {
        setAuthError(`Kalaerä asetettiin myyntiin. Tarjous lähetettiin ${emailResult.sent.length} ostajalle, mutta lähetys epäonnistui ${emailResult.failed.length} ostajalle.`);
      } else {
        setAuthInfo(`Kalaerä asetettiin myyntiin ja tarjous lähetettiin ${emailResult.sent.length} ostajalle.`);
      }
    } catch (error) {
      setAuthError(entryUpdated
        ? `Kalaerä asetettiin myyntiin, mutta tarjouksen lähetys epäonnistui: ${String(error?.message || error)}`
        : `Kalaerän asettaminen myyntiin epäonnistui: ${String(error?.message || error)}`);
    } finally {
      setCatchSaleSaving(false);
      if (entryUpdated) {
        setCatchSaleEntry(null);
        setCatchSaleDraft(createCatchSaleDraft());
        await refreshBuyerOffers();
        setRefreshTick((prev) => prev + 1);
      }
    }
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

      const missingSellerSaleFields = getMissingSellerSaleFields(sellerProfileForTrade);
      if (missingSellerSaleFields.length > 0) {
        setAuthError(`Kauppaa ei voi hyväksyä ennen kuin kalastajan myyntitiedot on tallennettu. Puuttuu: ${missingSellerSaleFields.join(", ")}.`);
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

    const resolvedDeliveryArea = resolveOfferDeliveryArea(
      formState.deliveryMethod,
      formState.deliveryArea,
      formState.deliveryDestinations,
      getDefaultProfilePickupAddress(profileState),
    );

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
      `Toimitusalue: ${resolvedDeliveryArea || "-"}`,
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
          delivery_area: resolvedDeliveryArea || null,
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
            deliveryArea: resolvedDeliveryArea,
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
    let fisherPremiumRequired = profile.role === "member" && !hasFisherPremium;
    const totalKilosForOffer = speciesRows.reduce((sum, row) => sum + Number(row.kilos || 0), 0);
    const selectedVesselId = form.fishingWithoutVessel ? "" : String(form.selectedVesselId || commercialFishingVesselOptions[0] || "").trim();
    const batchSourceIdentifier = form.fishingWithoutVessel
      ? String(profile.commercial_fishing_id || "").trim()
      : getPreferredBatchSourceIdentifier(profile, selectedVesselId);
    const marineCatch = isMarineCatchForm(form, catchAreaSelector);
    const selectedInlandGear = marineCatch ? null : getInlandGearMeta(form.inlandGearCode || form.gear);
    const resolvedGearCount = selectedInlandGear?.fixedCount === 1 ? "1" : form.gearCount;
    const catchAmountRows = speciesRows.filter((row) => {
      const kilos = Number(row.kilos || 0);
      const count = Number(row.count || 0);
      return marineCatch ? kilos > 0 : (kilos > 0 || count > 0);
    });
    const validRows = !marineCatch && form.effortOnly
      ? [{ ...createSpeciesRow(), species: "Ei saalista", kilos: 0, count: 0, effortOnly: true }]
      : catchAmountRows;
    if (!validRows.length) {
      setAuthError("Täytä saaliille määrä tai valitse Tallenna pyyntiponnistus ilman saalista.");
      return;
    }
    if (validRows.some((row) => row.species === "Muu" && !String(row.customSpecies || "").trim())) {
      setAuthError("Kirjoita kalalajin nimi kaikille riveille, joilla lajiksi on valittu Muu.");
      return;
    }
    if (marineCatch && validRows.some((row) => !getSpeciesMetadata(getSpeciesRowLabel(row))?.fao)) {
      setAuthError("Rannikkokalastusilmoitus tarvitsee jokaiselle lajille vahvistetun FAO-koodin. Valitse laji valmiista lajilistasta.");
      return;
    }
    if (
      marineCatch
      && (form.vesselLengthClass === "under_10m" || form.vesselLengthClass === "without_vessel")
      && validRows.some((row) => !isCoastalReportSpeciesAllowed(getSpeciesRowLabel(row)))
    ) {
      setAuthError("Lohta ja turskaa ei ilmoiteta rannikkokalastusilmoituksella. Tee niistä päiväkohtainen purkamisilmoitus.");
      return;
    }
    if (!marineCatch && !form.effortOnly && validRows.some((row) => !Number.isInteger(Number(row.kilos || 0)))) {
      setAuthError("Sisävesisaaliin kilot ilmoitetaan viranomaisjärjestelmään kokonaislukuina.");
      return;
    }
    if (!marineCatch && !form.effortOnly && validRows.some((row) => (
      isInlandDualQuantitySpecies(getSpeciesRowLabel(row))
      && (Number(row.kilos || 0) <= 0 || !Number.isInteger(Number(row.count || 0)) || Number(row.count || 0) <= 0)
    ))) {
      setAuthError("Ravuille, nahkiaiselle ja lohelle ilmoitetaan sekä kokonaiset kilot että kappaleet.");
      return;
    }
    if (!String(form.landingPlace || "").trim()) {
      setAuthError("Täytä purkamispaikka ennen saaliin tallennusta. Virallinen saalisilmoitus tarvitsee purkamispaikan jokaiselle erälle.");
      return;
    }
    if (shouldSendOffer && validRows.some((row) => parseLocaleNumber(row.price_per_kg) == null)) {
      setAuthError("Täytä hinta jokaiselle kalalajille ennen saaliin tallennusta.");
      return;
    }
    if (isCatchAuction) {
      if (!auctionsAvailable) {
        setAuthError("Huutokauppapalvelu ei ole juuri nyt käytettävissä. Saalista ei tallennettu.");
        return;
      }
      const startingPrices = validRows.map((row) => parseLocaleNumber(row.price_per_kg));
      const minimumIncrement = normalizeAuctionMoney(form.auctionMinimumIncrement);
      const reservePrice = form.auctionReservePrice === "" ? null : normalizeAuctionMoney(form.auctionReservePrice);
      if (startingPrices.some((price) => price == null || price <= 0)) {
        setAuthError("Täytä huutokaupan lähtöhinta jokaiselle kalaerälle.");
        return;
      }
      if (!validRows.every((row) => isCrayfishSpecies(getSpeciesRowLabel(row))) && (minimumIncrement == null || minimumIncrement <= 0)) {
        setAuthError("Minimikorotuksen täytyy olla suurempi kuin nolla.");
        return;
      }
      if (reservePrice != null && startingPrices.some((price) => reservePrice < price)) {
        setAuthError("Pohjahinta ei voi olla huutokaupan lähtöhintaa pienempi.");
        return;
      }
    }
    if (
      form.listForSale
      && profile.role === "member"
      && !profile.fisher_premium_admin_enabled
      && !profile.fisherPremiumAdminEnabled
      && !isFisherPremiumProfile(profile)
      && (isGooglePlayBillingAvailable() || isAppleStoreKitAvailable())
    ) {
      setSaving(true);
      try {
        fisherPremiumRequired = !(await refreshFisherPremiumEntitlement());
      } catch (error) {
        setSaving(false);
        setAuthError(String(error?.message || error || "Premium-tilauksen tarkistaminen epäonnistui."));
        return;
      }
      setSaving(false);
    }
    if (form.listForSale && fisherPremiumRequired) {
      showFisherPremiumRequired("Tarjoa myyntiin, jäljitettävyystunnus ja tarjouslähetys");
      return;
    }
    if (form.listForSale) {
      const missingSellerSaleFields = getMissingSellerSaleFields(profile);
      if (missingSellerSaleFields.length > 0) {
        setAccountPanelOpen(true);
        setAuthError(`Täytä omat tiedot ennen kuin voit asettaa kalaerän myyntiin. Puuttuu: ${missingSellerSaleFields.join(", ")}.`);
        return;
      }
    }
    if (form.listForSale && !isConsumerSale && !String(form.packaging || "").trim()) {
      setAuthError("Valitse, miten myytävä kalaerä on pakattu.");
      return;
    }
    const consumerSaleUnitType = form.consumerSaleUnitType === "whole_fish" ? "whole_fish" : "package";
    const consumerVariants = (Array.isArray(form.consumerVariants) ? form.consumerVariants : []).map((variant) => ({
      id: String(variant.id || safeId()),
      sale_unit_type: consumerSaleUnitType,
      label: String(variant.label || "").trim(),
      package_size_kg: consumerSaleUnitType === "package" ? parseLocaleNumber(variant.packageSizeKg) : null,
      unit_price_including_vat: consumerSaleUnitType === "package" ? parseLocaleNumber(variant.unitPrice) : null,
      min_weight_kg: consumerSaleUnitType === "whole_fish" ? parseLocaleNumber(variant.minWeightKg) : null,
      max_weight_kg: consumerSaleUnitType === "whole_fish" ? parseLocaleNumber(variant.maxWeightKg) : null,
      price_per_kg_including_vat: consumerSaleUnitType === "whole_fish" ? parseLocaleNumber(variant.pricePerKg) : null,
      available_units: Math.floor(Number(variant.availableUnits || 0)),
    }));
    const consumerPickupLocation = String(form.consumerPickupLocation || derivedDeliveryArea || savedPickupAddress || "").trim();
    const consumerPickupStart = new Date(`${form.consumerPickupDate || ""}T${form.consumerPickupStartTime || ""}:00`);
    const consumerPickupEnd = new Date(`${form.consumerPickupDate || ""}T${form.consumerPickupEndTime || ""}:00`);
    const consumerOrderDeadlineHours = Number(form.consumerOrderDeadlineHours);
    if (isConsumerSale && consumerVariants.length < 1) {
      setAuthError("Lisää kuluttajamyyntiin vähintään yksi myyntiyksikkö.");
      return;
    }
    if (isConsumerSale && consumerVariants.some((variant) => !variant.label)) {
      setAuthError(consumerSaleUnitType === "whole_fish" ? "Nimeä jokainen kalan kokoluokka." : "Nimeä jokainen pakkauskoko.");
      return;
    }
    if (isConsumerSale && consumerSaleUnitType === "package" && consumerVariants.some((variant) => (
      !variant.package_size_kg || variant.package_size_kg <= 0
      || !variant.unit_price_including_vat || variant.unit_price_including_vat <= 0
      || variant.available_units < 1
    ))) {
      setAuthError("Täytä jokaiselle pakkaukselle koko, hinta ja myyntiin tuleva pakkausmäärä.");
      return;
    }
    if (isConsumerSale && consumerSaleUnitType === "whole_fish" && consumerVariants.some((variant) => (
      !variant.min_weight_kg || variant.min_weight_kg <= 0
      || !variant.max_weight_kg || variant.max_weight_kg < variant.min_weight_kg
      || !variant.price_per_kg_including_vat || variant.price_per_kg_including_vat <= 0
      || variant.available_units < 1
    ))) {
      setAuthError("Täytä jokaiselle kokoluokalle pienin ja suurin paino, kilohinta sekä kalojen määrä.");
      return;
    }
    if (isConsumerSale && !consumerPickupLocation) {
      setAuthError("Täytä kuluttajamyynnin noutopaikka.");
      return;
    }
    if (isConsumerSale && (!form.consumerPickupDate || !form.consumerPickupStartTime || !form.consumerPickupEndTime || Number.isNaN(consumerPickupStart.getTime()) || Number.isNaN(consumerPickupEnd.getTime()))) {
      setAuthError("Täytä noutopäivä sekä noudon alkamis- ja päättymisaika.");
      return;
    }
    if (isConsumerSale && consumerPickupEnd <= consumerPickupStart) {
      setAuthError("Noudon päättymisajan pitää olla alkamisajan jälkeen.");
      return;
    }
    if (isConsumerSale && (!String(form.consumerOrderDeadlineHours ?? "").trim() || !Number.isFinite(consumerOrderDeadlineHours) || consumerOrderDeadlineHours < 0)) {
      setAuthError("Täytä, montako tuntia ennen noutoa tilausten vastaanotto päättyy.");
      return;
    }
    const consumerOrderDeadline = new Date(consumerPickupStart.getTime() - consumerOrderDeadlineHours * 60 * 60 * 1000);
    if (isConsumerSale && consumerOrderDeadline <= new Date()) {
      setAuthError("Kuluttajamyynnin tilausaika on jo päättynyt. Siirrä noutoaikaa tai lyhennä tilauksen määräaikaa.");
      return;
    }
    if (isConsumerSale && validRows.length !== 1) {
      setAuthError("Suoraan kuluttajille myytävässä erässä voi olla yksi kalalaji kerrallaan.");
      return;
    }
    const consumerCatchKilos = Number(validRows[0]?.kilos || 0);
    const consumerAllocatedMinimumKilos = consumerVariants.reduce((sum, variant) => sum + (
      consumerSaleUnitType === "package"
        ? Number(variant.package_size_kg || 0) * variant.available_units
        : Number(variant.min_weight_kg || 0) * variant.available_units
    ), 0);
    if (isConsumerSale && consumerAllocatedMinimumKilos > consumerCatchKilos + 0.001) {
      setAuthError(consumerSaleUnitType === "whole_fish"
        ? "Kokoluokkien kalamäärien vähimmäispaino ylittää saaliin kokonaispainon. Pienennä kalojen määrää tai painoluokkia."
        : "Pakkausten yhteenlaskettu paino ylittää saaliin kokonaispainon. Pienennä pakkausmääriä.");
      return;
    }
    if (form.saleMode === "fixed" && form.listForSale && form.offerAudience === "selected" && form.selectedBuyerIds.length === 0) {
      setAuthError("Valitse vähintään yksi ostaja, jolle rajattu tarjous lähetetään.");
      return;
    }
    if (form.saleMode === "fixed" && form.listForSale && form.offerAudience !== "selected" && !form.offerToShops && !form.offerToRestaurants && !form.offerToWholesalers) {
      setAuthError("Valitse vähintään yksi ostajaryhmä tai käytä vaihtoehtoa “Vain tietyille ostajille”.");
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
    const officialForm = { ...form, selectedVesselId, gearCount: resolvedGearCount };
    const officialFormIssues = marineCatch
      ? validateMarineCatchForm(officialForm)
      : validateCatchFormForOfficialReporting(officialForm);
    const officialCatchSaveBlocker = getOfficialCatchSaveBlocker({
      marineCatch,
      issues: officialFormIssues,
      fisherPremiumRequired,
    });
    if (officialCatchSaveBlocker) {
      setAuthError(officialCatchSaveBlocker);
      return;
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
    const fishingDayId = marineCatch ? createFishingDayId({
      date: form.date,
      sourceIdentifier: batchSourceIdentifier,
    }) : null;
    const selectedMarineGear = getMarineGearByCode(form.marineGearCode);
    const payload = rowsWithBatchIds.map((row) => ({
      offer_to_shops: !fisherPremiumRequired && form.saleMode === "fixed" && form.listForSale && form.offerAudience !== "selected" ? form.offerToShops : false,
      offer_to_restaurants: !fisherPremiumRequired && form.saleMode === "fixed" && form.listForSale && form.offerAudience !== "selected" ? form.offerToRestaurants : false,
      offer_to_wholesalers: !fisherPremiumRequired && form.saleMode === "fixed" && form.listForSale && form.offerAudience !== "selected" ? form.offerToWholesalers : false,
      offer_restricted: !fisherPremiumRequired && form.saleMode === "fixed" && form.listForSale && form.offerAudience === "selected",
      date: form.date,
      area: form.area,
      municipality: form.municipality,
      origin_city: form.originCity || form.municipality || null,
      spot: form.spot,
      species: getSpeciesRowLabel(row),
      water_type: form.waterType || null,
      ices_subdivision: marineCatch ? (form.icesSubdivision || null) : null,
      statistical_rectangle: marineCatch ? (form.statisticalRectangle || null) : null,
      marine_gear_code: marineCatch ? (form.marineGearCode || null) : null,
      marine_gear_name: marineCatch ? (selectedMarineGear?.name || form.gear || null) : null,
      vessel_length_class: marineCatch ? (form.vesselLengthClass || null) : null,
      fishing_day_id: fishingDayId,
      released_catch_details: marineCatch ? (String(form.releasedCatchDetails || "").trim() || null) : null,
      incidental_bycatch_details: marineCatch ? (String(form.incidentalBycatchDetails || "").trim() || null) : null,
      lost_gear_details: marineCatch ? (String(form.lostGearDetails || "").trim() || null) : null,
      fishing_without_vessel: Boolean(form.fishingWithoutVessel),
      gear_count: String(resolvedGearCount || "").trim() || null,
      fishing_effort: String(form.fishingDurationDays || "").trim() || null,
      fishing_secondary_value: String(form.fishingSecondaryValue || "").trim() || null,
      gear_mesh_size: String(form.netMeshSize || "").trim() || null,
      gear_height: String(form.netHeight || "").trim() || null,
      ...(!marineCatch ? {
        inland_gear_code: getInlandGearCode(form.inlandGearCode || form.gear) || null,
        management_fishing: Boolean(form.managementFishing),
        effort_only: Boolean(form.effortOnly),
        gear_length: String(form.gearLength || "").trim() || null,
        gear_width: String(form.gearWidth || "").trim() || null,
        other_gear_name: String(form.otherGearName || "").trim() || null,
      } : {}),
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
      notes: appendCatchDetailsToNotes(form.notes, officialForm),
      batch_id: row.batch_id,
      owner_user_id: profile.id,
      owner_name: profile.display_name,
    }));

    let insertError = null;
    let insertedCatchEntries = [];
    const { data: initialInsertedEntries, error: initialInsertError } = await supabase.from("catch_entries").insert(payload).select("id, batch_id");
    insertError = initialInsertError;
    insertedCatchEntries = initialInsertedEntries || [];

    const marineSchemaColumns = [
      "ices_subdivision",
      "statistical_rectangle",
      "marine_gear_code",
      "marine_gear_name",
      "vessel_length_class",
      "fishing_day_id",
      "released_catch_details",
      "incidental_bycatch_details",
      "lost_gear_details",
    ];
    const inlandSchemaColumns = [
      "inland_gear_code",
      "management_fishing",
      "fishing_without_vessel",
      "effort_only",
      "gear_count",
      "fishing_effort",
      "fishing_secondary_value",
      "gear_mesh_size",
      "gear_height",
      "gear_length",
      "gear_width",
      "other_gear_name",
    ];
    const missingInlandSchema = insertError && inlandSchemaColumns.some((column) => String(insertError.message || "").includes(column));
    if (missingInlandSchema && !marineCatch) {
      setSaving(false);
      setAuthError("Tietokannasta puuttuvat vuoden 2025 sisävesisaalisilmoituksen kentät. Suorita migraatio 2026082501 ennen sisävesisaaliin tallentamista.");
      return;
    }
    const missingMarineSchema = insertError && marineSchemaColumns.some((column) => String(insertError.message || "").includes(column));
    if (missingMarineSchema && marineCatch) {
      setSaving(false);
      setAuthError("Tietokannasta puuttuvat rannikkokalastusilmoituksen kentät. Suorita migraatio 2026072701 ennen merisaaliin tallentamista.");
      return;
    }
    if (insertError && (String(insertError.message || "").includes("water_type") || missingMarineSchema)) {
      const fallbackPayload = payload.map((item) => {
        const next = { ...item };
        delete next.water_type;
        marineSchemaColumns.forEach((column) => delete next[column]);
        return next;
      });
      const { data: fallbackInsertedEntries, error: fallbackInsertError } = await supabase.from("catch_entries").insert(fallbackPayload).select("id, batch_id");
      insertError = fallbackInsertError;
      insertedCatchEntries = fallbackInsertedEntries || [];
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

    const newlySavedInlandGearPreset = marineCatch ? null : createInlandGearPreset(form);
    if (newlySavedInlandGearPreset) {
      setSavedInlandGearPresets((prev) => saveInlandGearPreset(prev, newlySavedInlandGearPreset));
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

    const savedCatchScrollTarget = String(rowsWithBatchIds?.[0]?.batch_id || "");

    try {
      if (isCatchAuction) {
        if (insertedCatchEntries.length !== rowsWithBatchIds.length) {
          throw new Error("Tallennetun saaliin tunnisteita ei saatu huutokaupan avaamista varten.");
        }
        let uploadedAuctionImagePath = "";
        if (auctionImageFile) {
          const extension = auctionImageFile.type === "image/png" ? "png" : auctionImageFile.type === "image/webp" ? "webp" : "jpg";
          uploadedAuctionImagePath = `${profile.id}/${crypto.randomUUID()}.${extension}`;
          const { error: imageUploadError } = await supabase.storage
            .from(AUCTION_IMAGE_BUCKET)
            .upload(uploadedAuctionImagePath, auctionImageFile, {
              cacheControl: "3600",
              contentType: auctionImageFile.type,
              upsert: false,
            });
          if (imageUploadError) throw new Error(`Huutokauppakuvan tallennus epäonnistui: ${imageUploadError.message}`);
        }
        for (let index = 0; index < insertedCatchEntries.length; index += 1) {
          const { data: auctionId, error: auctionError } = await supabase.rpc("create_catch_auction", {
            p_entry_id: insertedCatchEntries[index].id,
            p_duration_minutes: Number(form.auctionDurationMinutes),
            p_starting_price: parseLocaleNumber(rowsWithBatchIds[index].price_per_kg),
            p_minimum_increment: isCrayfishSpecies(getSpeciesRowLabel(rowsWithBatchIds[index])) ? 0.05 : normalizeAuctionMoney(form.auctionMinimumIncrement),
            p_reserve_price: form.auctionReservePrice === "" ? null : normalizeAuctionMoney(form.auctionReservePrice),
          });
          if (auctionError) throw auctionError;
          if (uploadedAuctionImagePath) {
            const { error: attachImageError } = await supabase.rpc("set_auction_image", {
              p_auction_id: auctionId,
              p_image_path: uploadedAuctionImagePath,
            });
            if (attachImageError) throw new Error(`Huutokauppa avattiin, mutta kuvaa ei voitu liittää: ${attachImageError.message}`);
          }
        }

        setAuthInfo(insertedCatchEntries.length === 1
          ? "Saalis tallennettu ja huutokauppa avattu. Palvelin lähettää ilmoitukset huutokauppaan oikeutetuille ostajille."
          : `Saalis tallennettu ja ${insertedCatchEntries.length} huutokauppaa avattu. Palvelin lähettää ilmoitukset huutokauppoihin oikeutetuille ostajille.`);
      } else if (isConsumerSale) {
        if (insertedCatchEntries.length !== 1) {
          throw new Error("Tallennetun saaliin tunnistetta ei saatu kuluttajalistausta varten.");
        }
        const consumerRow = rowsWithBatchIds[0];
        const { data: publishedConsumerListingId, error: consumerListingError } = await supabase.rpc("publish_consumer_listing", {
          p_catch_entry_id: insertedCatchEntries[0].id,
          p_batch_id: insertedCatchEntries[0].batch_id || consumerRow.batch_id,
          p_species: formatSpeciesForSale(getSpeciesRowLabel(consumerRow)),
          p_product_name: String(form.consumerProductName || formatSpeciesForSale(getSpeciesRowLabel(consumerRow))).trim(),
          p_description: String(form.consumerDescription || "").trim(),
          p_seller_name: profile.company_name || profile.display_name || "Paikallinen kalastaja",
          p_municipality: form.municipality || profile.city || "",
          p_pickup_location: consumerPickupLocation,
          p_catch_date: form.date || null,
          p_cold_storage: Boolean(form.coldTransport),
          p_pickup_start: consumerPickupStart.toISOString(),
          p_pickup_end: consumerPickupEnd.toISOString(),
          p_order_deadline: consumerOrderDeadline.toISOString(),
          p_variants: consumerVariants,
        });
        if (consumerListingError) throw consumerListingError;
        const consumerListingUrl = getConsumerListingUrl(publishedConsumerListingId, getPublicAppBaseUrl());
        const consumerNotificationResult = await invokeEdgeFunctionAuthenticated("notify-consumer-listing", {
          listingId: publishedConsumerListingId,
        }, session?.access_token);
        const notificationSummary = consumerNotificationResult.error
          ? "Kuluttajailmoitusten lähetys epäonnistui, mutta erä on julkaistu ja linkki toimii."
          : `Ilmoitus lähetettiin ${Number(consumerNotificationResult.data?.recipients || 0)} erää seuranneelle kuluttajalle.`;
        setAuthInfo(`Saalis julkaistiin vain kuluttajamarkkinapaikalle. Yritysostajille ei lähetetty tarjousta.\n${notificationSummary}\nJulkinen linkki: ${consumerListingUrl}`);
      } else {
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
      }
    } catch (saveFollowupError) {
      console.error(isCatchAuction ? "Huutokaupan avaaminen epäonnistui:" : isConsumerSale ? "Kuluttajalistauksen avaaminen epäonnistui:" : "Sähköpostin lähetys epäonnistui:", saveFollowupError);
      setAuthError(isCatchAuction
        ? `Saalis tallennettiin, mutta huutokaupan avaaminen epäonnistui: ${String(saveFollowupError?.message || saveFollowupError)}`
        : isConsumerSale
          ? `Saalis tallennettiin, mutta kuluttajalistauksen avaaminen epäonnistui: ${String(saveFollowupError?.message || saveFollowupError)}`
          : `Saalis tallennettu, mutta tarjoussähköpostin lähetys epäonnistui: ${String(saveFollowupError?.message || saveFollowupError)}`);
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
      fishingSecondaryValue: prev.fishingSecondaryValue || "",
      inlandGearCode: getInlandGearCode(prev.inlandGearCode || prev.gear),
      inlandGearPresetId: newlySavedInlandGearPreset?.id || prev.inlandGearPresetId || "",
      managementFishing: false,
      effortOnly: false,
      gearLength: prev.gearLength || "",
      gearWidth: prev.gearWidth || "",
      otherGearName: prev.otherGearName || "",
      selectedVesselId: commercialFishingVesselOptions[0] || "",
      fishingWithoutVessel: false,
      vesselLengthClass: prev.vesselLengthClass || "",
      icesSubdivision: prev.icesSubdivision || "",
      statisticalRectangle: prev.statisticalRectangle || "",
      marineGearCode: prev.marineGearCode || "",
      releasedCatchDetails: "",
      incidentalBycatchDetails: "",
      lostGearDetails: "",
      netHeight: prev.netHeight || "",
      netMeshSize: prev.netMeshSize || "",
      fykeHeight: prev.fykeHeight || "",
      notes: "",
      packaging: "",
      price_per_kg: "",
      date: today(),
      saleMode: "none",
      listForSale: false,
      consumerProductName: "",
      consumerProductNameAutoFilled: false,
      consumerDescription: "",
      consumerPickupLocation: "",
      consumerPickupDate: today(),
      consumerPickupStartTime: "12:00",
      consumerPickupEndTime: "13:00",
      consumerOrderDeadlineHours: "2",
      consumerSaleUnitType: "package",
      consumerVariants: [createConsumerSaleVariant("package")],
      auctionDurationMinutes: 180,
      auctionMinimumIncrement: "0,20",
      auctionReservePrice: "",
      offerToShops: false,
      offerToRestaurants: false,
      offerToWholesalers: false,
      offerAudience: "groups",
      selectedBuyerIds: [],
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
    deliveryDestinations: prev.deliveryDestinations || [],
    deliveryArea: savedPickupAddress,
    deliveryCost: "",
    earliestDeliveryDate: today(),
    coldTransport: false,
    }));
    setSpeciesRows([createSpeciesRow()]);
    setAuctionImageFile(null);
    setAuctionImagePreviewUrl("");
    setPendingEntriesScrollTarget(isConsumerSale ? "" : savedCatchScrollTarget);
    setRefreshTick((prev) => prev + 1);
    setActiveTab(isCatchAuction ? "auctions" : isConsumerSale ? "offers" : "entries");
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

    const iosSafariTargetWindow = mode === "print" && isIosSafariWeb() ? openPendingPdfWindow() : null;
    if (mode === "print" && isIosSafariWeb() && !iosSafariTargetWindow) {
      setAuthError("PDF-ikkunan avaaminen estettiin iPhonessa. Salli ponnahdusikkunat tälle sivulle ja yritä uudelleen.");
      return;
    }

    if (mode === "pdf" || (mode === "print" && (isNativeCapacitorApp() || isIosSafariWeb()))) {
      void (async () => {
        try {
          const doc = await buildProcessedLabelPdf(entry, profile, printFormat);
          await presentPdfDocument(doc, buildProcessedLabelPdfFileName(entry, printFormat), {
            browserAction: mode === "print" && isIosSafariWeb() ? "open" : "download",
            targetWindow: iosSafariTargetWindow,
          });
        } catch (error) {
          if (iosSafariTargetWindow && !iosSafariTargetWindow.closed) {
            try {
              iosSafariTargetWindow.close();
            } catch {
              // ignore close failures
            }
          }
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

    const { error: buyerOfferDeleteError } = await deleteBuyerOffersForEntries([entry]);
    if (buyerOfferDeleteError) {
      if (isMissingRefreshTokenError(buyerOfferDeleteError)) {
        await invalidateSession();
        return;
      }
      setAuthError(buyerOfferDeleteError.message);
      return;
    }

    const { error: entryDeleteError } = await supabase.from("catch_entries").delete().eq("id", entry.id);
    if (entryDeleteError) {
      if (isMissingRefreshTokenError(entryDeleteError)) {
        await invalidateSession();
        return;
      }
      setAuthError(entryDeleteError.message);
      return;
    }

    setAuthInfo("Saalistieto poistettu.");
    await refreshBuyerOffers();
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
    const resolvedPrintFormat = String(overrides?.printFormat || labelPrintFormat || CATCH_LABEL_FORMAT_MUNBYN_4X3);
    const storedCatchDefaults = getStoredCatchFormDefaults(profile);
    const resolvedWaterType = isThermalCatchLabelFormat(resolvedPrintFormat)
      ? String(overrides?.waterType || labelPrintWaterType || targetEntry?.waterType || profile?.water_type || storedCatchDefaults.waterType || "").trim()
      : String(targetEntry?.waterType || profile?.water_type || storedCatchDefaults.waterType || "").trim();
    const resolvedPieceCount = isCrayfishSpecies(targetEntry?.species)
      ? String(overrides?.pieceCount ?? labelPrintPieceCount ?? "").trim()
      : "";
    const resolvedWeightKg = !isCrayfishSpecies(targetEntry?.species)
      ? String(overrides?.weightKg ?? labelPrintWeightKg ?? "").trim()
      : "";
    const resolvedProductForm = !isCrayfishSpecies(targetEntry?.species)
      ? String(overrides?.productForm ?? labelPrintProductForm ?? "").trim()
      : "";
    const resolvedUseByDate = String(overrides?.useByDate ?? labelPrintUseByDate ?? "").trim();
    const labelOptions = {
      waterType: resolvedWaterType,
      pieceCount: resolvedPieceCount,
      weightKg: resolvedWeightKg,
      productForm: resolvedProductForm,
      useByDate: resolvedUseByDate,
    };
    const labelData = buildCatchLabelData(targetEntry, profile, 1, resolvedLabelCount, labelOptions);

    if (!labelData.species || !labelData.batchId || !labelData.supplier) {
      setAuthError("Etikettiä ei voi tulostaa ennen kuin kalalaji, erätunnus ja toimittaja ovat täytetty.");
      return;
    }

    if (isThermalCatchLabelFormat(resolvedPrintFormat) && !resolvedWaterType) {
      setAuthError("Valitse vesityyppi ennen MUNBYN-etiketin tulostusta.");
      return;
    }

    setLabelPrintEntry(null);

    const iosSafariTargetWindow = mode === "print" && isIosSafariWeb() ? openPendingPdfWindow() : null;
    if (mode === "print" && isIosSafariWeb() && !iosSafariTargetWindow) {
      setAuthError("PDF-ikkunan avaaminen estettiin iPhonessa. Salli ponnahdusikkunat tälle sivulle ja yritä uudelleen.");
      return;
    }

    if (mode === "pdf" || (mode === "print" && (isNativeCapacitorApp() || isIosSafariWeb()))) {
      void (async () => {
        try {
          const doc = await buildCatchLabelPdf(targetEntry, { ...profile, water_type: resolvedWaterType }, resolvedLabelCount, resolvedPrintFormat, labelOptions);
          await presentPdfDocument(doc, buildCatchLabelPdfFileName(targetEntry), {
            nativeFileName: buildUniqueCatchLabelNativeFileName(targetEntry),
            dedupeKey: `${String(targetEntry?.id || targetEntry?.batchId || "label")}::${resolvedPrintFormat}::${resolvedLabelCount}::${resolvedWaterType}::${Date.now()}`,
            browserAction: mode === "print" && isIosSafariWeb() ? "open" : "download",
            targetWindow: iosSafariTargetWindow,
          });
        } catch (error) {
          if (iosSafariTargetWindow && !iosSafariTargetWindow.closed) {
            try {
              iosSafariTargetWindow.close();
            } catch {
              // ignore close failures
            }
          }
          console.error("Etiketti-PDF:n luonti epäonnistui:", error);
          setAuthError(`Etiketti-PDF:n luonti epäonnistui: ${String(error?.message || error)}`);
        }
      })();
      return;
    }
    const html = buildCatchLabelPrintHtml(targetEntry, { ...profile, water_type: resolvedWaterType }, resolvedLabelCount, resolvedPrintFormat, labelOptions);
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
    return (
      <PublicApp
        batchView={{
          batchId: publicBatchId,
          data: publicBatchData,
          loading: publicBatchLoading,
          error: publicBatchError,
          onLeave: closePublicBatchView,
        }}
      />
    );
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
    return <AuthView authMode={authMode} setAuthMode={setAuthMode} authForm={authForm} setAuthForm={setAuthForm} onSignIn={handleSignIn} onSignUp={handleSignUp} onForgotPassword={handleForgotPassword} onResetRecoveredPassword={handleResetRecoveredPassword} authError={visibleAuthError} authInfo={authInfo} authSubmitting={authSubmitting} viewportWidth={viewportWidth} />;
  }

  if (!profile.is_active && availableRoleOptions.length === 0) {
    return (
      <PendingApprovalView
        profile={profile}
        onLogout={handleLogout}
        onDeleteAccount={handleDeleteOwnAccount}
        accountDeletionBusy={accountDeletionBusy}
        showDeleteAccount={isAppleStoreKitAvailable()}
      />
    );
  }

  if (roleSelectionOpen && availableRoleOptions.length > 1) {
    return <RoleSelectionView roleOptions={availableRoleOptions} buyers={buyers} onSelectRole={handleRoleSelect} />;
  }

  if (profile.role === "consumer") {
    return <ConsumerApp initialListingId={consumerListingId} />;
  }

  const handleGoToHome = () => {
    setAccountPanelOpen(false);
    setHelpOpen(false);
    setCatchSaleEntry(null);
    setLabelPrintEntry(null);
    setBuyerActiveOfferId(null);
    setPendingAuctionTarget(null);
    setPendingOfferTarget(null);
    setBuyerOffersFilter("new");
    setBuyerOffersSearch("");
    setActiveTab("dashboard");
    window.requestAnimationFrame(() => {
      tabsScrollRef.current?.scrollTo({ left: 0, behavior: "smooth" });
      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    });
  };

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
      if (isAuctionTradeOffer(offer)) return false;
      const q = buyerOffersSearch.trim().toLowerCase();
      const statusOk = buyerOffersFilter === "all"
        ? true
        : buyerOffersFilter === "new"
        ? offer.status === "sent"
        : buyerOffersFilter === "decision"
        ? offer.status === "viewed"
        : buyerOffersFilter === "open"
        ? hasBuyerOfferStatus(offer.status, BUYER_OFFER_OPEN_RESPONSE_STATUSES)
        : buyerOffersFilter === "reserved_purchased"
        ? ["reserved", "accepted"].includes(String(offer.status || ""))
        : buyerOffersFilter === "incoming"
        ? isBuyerOfferAccepted(offer.status) && !["delivered", "received"].includes(String(offer.fulfillment_status || ""))
        : buyerOffersFilter === "purchased" || buyerOffersFilter === "accepted"
        ? isBuyerOfferAccepted(offer.status)
        : offer.status === buyerOffersFilter;
      const text = [
        offer.seller_name,
        offer.area,
        offer.spot,
        offer.species_summary,
        offer.status,
        offer.buyer_message,
        offer.delivery_destination_city,
        offer.earliest_delivery_date,
      ]
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
      (offer) => !isAuctionTradeOffer(offer) && isBuyerOfferAccepted(offer.status) && formatOfferDay(offer.updated_at || offer.created_at) === todayLabel
    );
    const buyerInvoiceOffers = (buyerOffers || [])
      .filter((offer) => ["invoiced", "paid"].includes(String(offer.billing_status || "")))
      .sort((a, b) => {
        const aTime = new Date(a.paid_at || a.billed_at || a.updated_at || a.created_at || 0).getTime();
        const bTime = new Date(b.paid_at || b.billed_at || b.updated_at || b.created_at || 0).getTime();
        return bTime - aTime;
      });
    const buyerInvoiceGroups = Array.from(
      buyerInvoiceOffers.reduce((acc, offer) => {
        const key = [
          String(offer.billing_status || "invoiced").trim(),
          String(offer.seller_user_id || offer.seller_name || "").trim(),
          String(offer.billing_month || "").trim(),
          getBuyerInvoiceGroupingBucket(offer),
        ].join("|");
        const existing = acc.get(key);
        if (existing) {
          existing.offers.push(offer);
          return acc;
        }
        acc.set(key, { key, offers: [offer] });
        return acc;
      }, new Map()).values(),
    );
    const openBuyerInvoiceGroups = buyerInvoiceGroups.filter(({ offers }) => String(offers?.[0]?.billing_status || "").trim() === "invoiced");
    const paidBuyerInvoiceGroups = buyerInvoiceGroups.filter(({ offers }) => String(offers?.[0]?.billing_status || "").trim() === "paid");
    const fixedPriceBuyerOffers = (buyerOffers || []).filter((offer) => !isAuctionTradeOffer(offer));
    const buyerMarketplaceSpecies = Array.from(new Set(
      fixedPriceBuyerOffers
        .filter((offer) => hasBuyerOfferStatus(offer.status, BUYER_OFFER_OPEN_RESPONSE_STATUSES))
        .map((offer) => getOfferSpeciesHeadline(offer?.species_summary, { hideTraceability: true }))
        .map((label) => String(label || "").split(/[·,]/)[0].trim())
        .filter(Boolean)
    )).slice(0, 4);
    const buyerLocationQuickFilter = String(
      linkedBuyerRecord?.delivery_city || linkedBuyerRecord?.city || ""
    ).trim();
    const buyerDashboardCounts = {
      newOffers: fixedPriceBuyerOffers.filter((offer) => offer.status === "sent").length,
      requiresDecision: fixedPriceBuyerOffers.filter((offer) => offer.status === "viewed").length,
      reservedAndPurchased: fixedPriceBuyerOffers.filter((offer) => ["reserved", "accepted"].includes(String(offer.status || ""))).length,
      incomingDeliveries: fixedPriceBuyerOffers.filter((offer) => isBuyerOfferAccepted(offer.status) && !["delivered", "received"].includes(String(offer.fulfillment_status || ""))).length,
      openInvoices: openBuyerInvoiceGroups.length,
    };
    const scrollBuyerViewIntoPlace = (targetId = "") => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const targetElement = targetId ? document.getElementById(targetId) : null;
          if (targetElement) {
            targetElement.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
          }
          window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
        });
      });
    };
    const openBuyerTab = (targetTab, targetId = "") => {
      setBuyerMenuOpen(false);
      setAccountPanelOpen(false);
      setActiveTab(targetTab);
      scrollBuyerViewIntoPlace(targetId);
    };
    const openBuyerOfferCategory = (filter, targetTab = "offers") => {
      setBuyerOffersFilter(filter);
      openBuyerTab(targetTab, targetTab === "buyer_billing" ? "buyer-invoices-view" : "buyer-offers-list");
    };
    const headerBrandStyles = getHeaderBrandStyles(viewportWidth);

    return (
      <div style={{ ...styles.app, paddingBottom: "max(96px, calc(76px + env(safe-area-inset-bottom)))" }}>
        <div style={styles.container}>
          <div style={{
            ...styles.card,
            ...styles.headerCard,
            position: "relative",
            zIndex: buyerMenuOpen ? 100 : "auto",
            backdropFilter: buyerMenuOpen ? "none" : styles.card.backdropFilter,
            paddingLeft: viewportWidth < 560 ? 62 : 82,
            paddingRight: viewportWidth < 560 ? 58 : 76,
          }}>
            <button
              type="button"
              aria-label={buyerMenuOpen ? "Sulje käyttäjävalikko" : "Avaa käyttäjävalikko"}
              aria-expanded={buyerMenuOpen}
              onClick={() => setBuyerMenuOpen((previous) => !previous)}
              style={{
                position: "absolute",
                top: viewportWidth < 560 ? 12 : 18,
                left: viewportWidth < 560 ? 12 : 18,
                zIndex: 62,
                width: viewportWidth < 560 ? 38 : 44,
                height: viewportWidth < 560 ? 38 : 44,
                display: "inline-flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                border: "1px solid #93c5fd",
                borderRadius: 999,
                background: buyerMenuOpen ? "#0f3d5e" : "#eff6ff",
                color: buyerMenuOpen ? "#fff" : "#1d4ed8",
                cursor: "pointer",
                boxShadow: "0 6px 16px rgba(37, 99, 235, 0.12)",
              }}
            >
              {[0, 1, 2].map((line) => (
                <span key={line} aria-hidden="true" style={{ width: 17, height: 2, borderRadius: 999, background: "currentColor" }} />
              ))}
            </button>
            {buyerMenuOpen ? (
              <>
                <button
                  type="button"
                  aria-label="Sulje käyttäjävalikko"
                  onClick={() => setBuyerMenuOpen(false)}
                  style={{ position: "fixed", inset: 0, zIndex: 60, border: 0, background: "rgba(15, 23, 42, 0.12)", cursor: "default" }}
                />
                <div style={{
                  position: "absolute",
                  top: viewportWidth < 560 ? 58 : 70,
                  left: viewportWidth < 560 ? 12 : 18,
                  zIndex: 63,
                  width: `min(330px, calc(100vw - ${viewportWidth < 560 ? 24 : 36}px))`,
                  padding: 14,
                  display: "grid",
                  gap: 9,
                  border: "1px solid #bfdbfe",
                  borderRadius: 20,
                  background: "rgba(255,255,255,0.98)",
                  boxShadow: "0 22px 52px rgba(15, 23, 42, 0.24)",
                  backdropFilter: "blur(18px)",
                }}>
                  <div style={{ padding: "4px 5px 10px", borderBottom: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: 16, fontWeight: 900, color: "#0f172a" }}>{profile.display_name || "Ostaja"}</div>
                    <div style={{ marginTop: 3, fontSize: 13, color: "#64748b" }}>{profile.email || ""}</div>
                    <div style={{ marginTop: 5, fontSize: 12, fontWeight: 850, color: "#0f3d5e" }}>Rooli: {roleLabel(profile?.role)}</div>
                  </div>
                  {availableRoleOptions.length > 1 ? (
                    <select
                      aria-label="Vaihda roolia"
                      style={{ ...styles.input, width: "100%" }}
                      value={activeRoleOption?.id || ""}
                      onChange={(event) => {
                        const selectedRole = availableRoleOptions.find((option) => String(option.id) === String(event.target.value));
                        setBuyerMenuOpen(false);
                        if (selectedRole) handleRoleSelect(selectedRole);
                      }}
                    >
                      {availableRoleOptions.map((option) => (
                        <option key={option.id} value={option.id}>{buildRoleOptionLabel(option, buyers)}</option>
                      ))}
                    </select>
                  ) : null}
                  <button type="button" style={{ ...styles.button, width: "100%", justifyContent: "flex-start" }} onClick={() => {
                    setBuyerMenuOpen(false);
                    void handleManualRefresh();
                  }}>↻ Päivitä tiedot</button>
                  <button type="button" style={{ ...styles.button, width: "100%", justifyContent: "flex-start" }} onClick={() => {
                    const nextOpen = !accountPanelOpen;
                    setBuyerMenuOpen(false);
                    setAccountPanelOpen(nextOpen);
                    if (nextOpen) scrollBuyerViewIntoPlace("account-details-panel");
                  }}>{accountPanelOpen ? "Sulje omat tiedot" : "Omat tiedot"}</button>
                  <button type="button" style={{ ...styles.button, width: "100%", justifyContent: "flex-start", background: "#fff7ed", borderColor: "#fdba74", color: "#9a3412" }} onClick={() => {
                    setBuyerMenuOpen(false);
                    handleLogout();
                  }}>Kirjaudu ulos</button>
                </div>
              </>
            ) : null}
            <button
              type="button"
              aria-label="Avaa sovelluksen käyttöohje"
              title="Käyttöohje"
              onClick={() => setHelpOpen(true)}
              style={{
                position: "absolute",
                top: viewportWidth < 560 ? 12 : 18,
                right: viewportWidth < 560 ? 12 : 18,
                width: viewportWidth < 560 ? 38 : 44,
                height: viewportWidth < 560 ? 38 : 44,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid #93c5fd",
                borderRadius: 999,
                background: "#eff6ff",
                color: "#1d4ed8",
                fontSize: viewportWidth < 560 ? 22 : 25,
                fontFamily: "Georgia, serif",
                fontWeight: 800,
                cursor: "pointer",
                boxShadow: "0 6px 16px rgba(37, 99, 235, 0.12)",
              }}
            >
              i
            </button>
            <div>
              <div style={{ ...headerBrandStyles.row, ...(viewportWidth < 560 ? { marginTop: 4 } : {}) }}>
                  <h1 style={headerBrandStyles.title}>Suoraan Kalastajalta</h1>
                  {viewportWidth < 560 ? (
                    <div aria-hidden="true" style={{
                      position: "relative",
                      flex: "0 0 auto",
                      width: "clamp(70px, 20vw, 78px)",
                      height: "clamp(70px, 20vw, 78px)",
                      overflow: "hidden",
                    }}>
                      <img
                        src="/logo.png"
                        alt=""
                        style={{
                          position: "absolute",
                          top: "50%",
                          left: "50%",
                          width: "270%",
                          height: "auto",
                          maxWidth: "none",
                          transform: "translate(-50%, -50%)",
                          display: "block",
                        }}
                      />
                    </div>
                  ) : (
                    <img
                      src="/logo.png"
                      alt=""
                      style={{ ...headerBrandStyles.logo, marginLeft: viewportWidth < 768 ? -10 : -6 }}
                    />
                  )}
              </div>
            </div>
          </div>
          {helpOpen ? <HelpDialog role={profile.role} onClose={() => setHelpOpen(false)} /> : null}
          {buyerTradeProfileIncomplete && !accountPanelOpen ? (
            <div style={{ ...styles.noticeInfo, ...styles.rowBetween, gap: 12, marginBottom: 16 }}>
              <div>
                <strong>Täydennä ostajan tiedot</strong>
                <div style={{ ...styles.muted, marginTop: 3 }}>Puuttuvat tiedot: {missingBuyerTradeFields.join(", ")}.</div>
              </div>
              <button type="button" style={{ ...styles.button, ...styles.primaryButton, flex: "0 0 auto" }} onClick={() => {
                setAccountPanelOpen(true);
                scrollBuyerViewIntoPlace("account-details-panel");
              }}>Täydennä</button>
            </div>
          ) : null}
          {accountPanelOpen ? (
            <div id="account-details-panel" style={{ ...styles.card, ...styles.sectionCard, ...styles.stack, marginBottom: 16 }}>
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
                {!linkedBuyerRecord ? (
                  <div style={styles.noticeInfo}>Täytä ostajan tiedot. Ostajarekisterin yritys luodaan ja linkitetään käyttäjääsi ensimmäisellä tallennuksella.</div>
                ) : null}
                {profile.role === "buyer" ? (
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
              {isAppleStoreKitAvailable() ? (
                <AccountDeletionCard onDeleteAccount={handleDeleteOwnAccount} busy={accountDeletionBusy} />
              ) : null}
            </div>
          ) : null}

          {visibleAuthError ? <div style={{ ...styles.noticeError, marginBottom: 16 }}>{visibleAuthError}</div> : null}
          {authInfo ? <div style={{ ...styles.noticeSuccess, marginBottom: 16 }}>{authInfo}</div> : null}
          <FirstUseGuideCard
            profile={profile}
            guideState={onboardingGuideState}
            onDismissNow={dismissOnboardingGuideNow}
            onHideForever={hideOnboardingGuideForever}
            viewportWidth={viewportWidth}
          />

          <div style={{
            ...styles.stickyTabsWrap,
            top: viewportWidth < 768 && isNativeIosApp() ? 116 : viewportWidth < 560 ? 70 : 76,
            ...(viewportWidth < 620 ? { display: "none" } : {}),
          }}>
            <div style={{
              ...styles.tabs6,
              gridTemplateColumns: `repeat(${auctionsAvailable ? 5 : 4}, minmax(0, 1fr))`,
              gap: 10,
              padding: 8,
              borderRadius: 20,
              boxShadow: "0 14px 32px rgba(15, 23, 42, 0.10)",
            }}>
              <button
                style={{
                  ...styles.tab,
                  minWidth: 0,
                  minHeight: 50,
                  whiteSpace: "nowrap",
                  padding: viewportWidth < 520 ? "12px 8px" : styles.tab.padding,
                  fontSize: viewportWidth < 520 ? 15 : styles.tab.fontSize,
                  border: "1px solid rgba(147, 197, 253, 0.72)",
                  background: "rgba(239, 246, 255, 0.72)",
                  ...(activeTab === "dashboard" ? styles.activeTab : {}),
                }}
                onClick={() => openBuyerTab("dashboard")}
              >
                Aloitus
              </button>
              <button
                style={{
                  ...styles.tab,
                  minWidth: 0,
                  minHeight: 50,
                  whiteSpace: "nowrap",
                  padding: viewportWidth < 520 ? "12px 8px" : styles.tab.padding,
                  fontSize: viewportWidth < 520 ? 15 : styles.tab.fontSize,
                  border: "1px solid rgba(147, 197, 253, 0.72)",
                  background: "rgba(239, 246, 255, 0.72)",
                  ...(activeTab === "offers" ? styles.activeTab : {}),
                }}
                onClick={() => openBuyerOfferCategory(buyerOffersFilter, "offers")}
              >
                Tarjoukset
              </button>
              {auctionsAvailable ? (
                <button
                  style={{
                    ...styles.tab,
                    minWidth: 0,
                    minHeight: 50,
                    whiteSpace: "nowrap",
                    padding: viewportWidth < 520 ? "12px 8px" : styles.tab.padding,
                    fontSize: viewportWidth < 520 ? 15 : styles.tab.fontSize,
                    border: "1px solid rgba(147, 197, 253, 0.72)",
                    background: "rgba(239, 246, 255, 0.72)",
                    ...(activeTab === "auctions" ? styles.activeTab : {}),
                  }}
                  onClick={() => openBuyerTab("auctions")}
                >
                  Huutokaupat
                </button>
              ) : null}
              <button
                style={{
                  ...styles.tab,
                  minWidth: 0,
                  minHeight: 50,
                  whiteSpace: "nowrap",
                  padding: viewportWidth < 520 ? "12px 8px" : styles.tab.padding,
                  fontSize: viewportWidth < 520 ? 15 : styles.tab.fontSize,
                  border: "1px solid rgba(147, 197, 253, 0.72)",
                  background: "rgba(239, 246, 255, 0.72)",
                  ...(activeTab === "reports" ? styles.activeTab : {}),
                }}
                onClick={() => openBuyerTab("reports")}
              >
                Raportit
              </button>
              <button
                style={{
                  ...styles.tab,
                  minWidth: 0,
                  minHeight: 50,
                  whiteSpace: "nowrap",
                  padding: viewportWidth < 520 ? "12px 8px" : styles.tab.padding,
                  fontSize: viewportWidth < 520 ? 15 : styles.tab.fontSize,
                  border: "1px solid rgba(147, 197, 253, 0.72)",
                  background: "rgba(239, 246, 255, 0.72)",
                  ...(activeTab === "buyer_billing" ? styles.activeTab : {}),
                }}
                onClick={() => openBuyerTab("buyer_billing", "buyer-invoices-view")}
              >
                Laskut
              </button>
            </div>
          </div>

          {activeTab === "auctions" && auctionsAvailable ? (
            <AuctionsView profile={profile} buyerRecord={linkedBuyerRecord} entries={[]} notificationTarget={pendingAuctionTarget} onNotificationTargetHandled={handleAuctionTargetHandled} onTradeCreated={() => setRefreshTick((previous) => previous + 1)} onCreateDeliveryNote={handleCreateAuctionDeliveryNote} onOpenAccountDetails={openAccountDetails} />
          ) : null}

          {activeTab === "reports" ? (
            <ReportsView entries={entries} processedEntries={processedEntries} offers={offers} profile={profile} />
          ) : null}

          {activeTab === "buyer_billing" ? (
            <div id="buyer-invoices-view" style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
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
              ) : (
                <>
                  <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack, background: "#f8fafc" }}>
                    <div style={styles.rowBetween}>
                      <div>
                        <strong>Avoimet laskut</strong>
                        <div style={styles.muted}>Tässä näkyvät kalastajan lähettämät avoimet laskut. Lasku siirtyy maksetuksi, kun kalastaja kuittaa maksun vastaanotetuksi.</div>
                      </div>
                      <span style={styles.badge}>{openBuyerInvoiceGroups.length}</span>
                    </div>
                    {openBuyerInvoiceGroups.length === 0 ? (
                      <div style={styles.muted}>Ei avoimia laskuja.</div>
                    ) : openBuyerInvoiceGroups.map((group) => {
                      const offersInGroup = group.offers || [];
                      const firstOffer = offersInGroup[0];
                      const sellerProfileLike = {
                        ...buildBuyerInvoiceSellerProfileLike(firstOffer),
                        business_id: resolveBuyerVisibleSellerBusinessId(firstOffer, getBuyerVisibleSellerInfo(firstOffer)) || buildBuyerInvoiceSellerProfileLike(firstOffer).business_id || "",
                      };
                      const isGroupInvoice = offersInGroup.length > 1;
                      const invoicePayload = isGroupInvoice
                        ? getSellerGroupInvoicePayload(offersInGroup, sellerProfileLike)
                        : getSellerInvoicePayload(firstOffer, sellerProfileLike);

                      return (
                        <div key={`buyer-open-invoice-${group.key}`} style={{ ...styles.entry, background: "#fff" }}>
                          <div style={styles.rowBetween}>
                            <div>
                              <strong>{invoicePayload.sellerName || "Kalastaja"}</strong>
                              <div style={styles.muted}>Lasku: {invoicePayload.invoiceNumber}</div>
                            </div>
                            <span style={{ ...styles.badge, background: "#fff7ed", borderColor: "#fdba74" }}>{getBuyerInvoiceStatusLabel(firstOffer?.billing_status)}</span>
                          </div>

                          <div style={styles.entryBadges}>
                            <span style={{ ...styles.badge, background: "#eff6ff" }}>{euro(invoicePayload.grandTotal)} lasku</span>
                            <span style={styles.badge}>{euro(invoicePayload.netTotal || invoicePayload.productTotal)} veroton</span>
                            <span style={styles.badge}>ALV {(invoicePayload.vatRate * 100).toLocaleString("fi-FI")} % {euro(invoicePayload.vatAmount)}</span>
                            {isGroupInvoice ? <span style={styles.badge}>{offersInGroup.length} erää</span> : null}
                          </div>

                          <div style={{ ...styles.muted, whiteSpace: "pre-wrap" }}>
                            <strong>{isGroupInvoice ? "Koontilaskun erät:" : "Erä:"}</strong> {formatInvoiceLineItemsSummary(invoicePayload.lineItems, invoicePayload.vatRate)}
                          </div>
                          {invoicePayload.batchIds?.length > 0 ? <div style={styles.muted}><strong>Erätunnukset:</strong> <span style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>{invoicePayload.batchIds.join(", ")}</span></div> : null}
                          {!invoicePayload.batchIds?.length && invoicePayload.batchId ? <div style={styles.muted}><strong>Erätunnus:</strong> <span style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>{invoicePayload.batchId}</span></div> : null}
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
                              onClick={() => isGroupInvoice ? handleOpenBuyerGroupInvoicePdf(offersInGroup) : handleOpenBuyerInvoicePdf(firstOffer)}
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

                  <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack, background: "#f8fafc" }}>
                    <div style={styles.rowBetween}>
                      <div>
                        <strong>Maksetut laskut</strong>
                        <div style={styles.muted}>Tässä näkyvät ostajan maksetuksi kuittaamat laskut.</div>
                      </div>
                      <span style={styles.badge}>{paidBuyerInvoiceGroups.length}</span>
                    </div>
                    {paidBuyerInvoiceGroups.length === 0 ? (
                      <div style={styles.muted}>Ei vielä maksettuja laskuja.</div>
                    ) : paidBuyerInvoiceGroups.map((group) => {
                      const offersInGroup = group.offers || [];
                      const firstOffer = offersInGroup[0];
                      const sellerProfileLike = {
                        ...buildBuyerInvoiceSellerProfileLike(firstOffer),
                        business_id: resolveBuyerVisibleSellerBusinessId(firstOffer, getBuyerVisibleSellerInfo(firstOffer)) || buildBuyerInvoiceSellerProfileLike(firstOffer).business_id || "",
                      };
                      const isGroupInvoice = offersInGroup.length > 1;
                      const invoicePayload = isGroupInvoice
                        ? getSellerGroupInvoicePayload(offersInGroup, sellerProfileLike)
                        : getSellerInvoicePayload(firstOffer, sellerProfileLike);

                      return (
                        <div key={`buyer-paid-invoice-${group.key}`} style={{ ...styles.entry, background: "#fff" }}>
                          <div style={styles.rowBetween}>
                            <div>
                              <strong>{invoicePayload.sellerName || "Kalastaja"}</strong>
                              <div style={styles.muted}>Lasku: {invoicePayload.invoiceNumber}</div>
                            </div>
                            <span style={{ ...styles.badge, background: "#ecfdf5", borderColor: "#86efac" }}>{getBuyerInvoiceStatusLabel(firstOffer?.billing_status)}</span>
                          </div>

                          <div style={styles.entryBadges}>
                            <span style={{ ...styles.badge, background: "#eff6ff" }}>{euro(invoicePayload.grandTotal)} lasku</span>
                            {isGroupInvoice ? <span style={styles.badge}>{offersInGroup.length} erää</span> : null}
                            {firstOffer?.paid_at ? <span style={styles.badge}>Maksettu {formatOfferDate(firstOffer.paid_at)}</span> : null}
                          </div>

                          <div style={{ ...styles.muted, whiteSpace: "pre-wrap" }}>
                            <strong>{isGroupInvoice ? "Koontilaskun erät:" : "Erä:"}</strong> {formatInvoiceLineItemsSummary(invoicePayload.lineItems, invoicePayload.vatRate)}
                          </div>
                          <div style={styles.row}>
                            <button
                              type="button"
                              style={styles.button}
                              onClick={() => isGroupInvoice ? handleOpenBuyerGroupInvoicePdf(offersInGroup) : handleOpenBuyerInvoicePdf(firstOffer)}
                              disabled={!invoicePayload.sellerIban}
                            >
                              Avaa lasku (PDF)
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          ) : null}

          {activeTab === "dashboard" ? (
            <div style={{ ...styles.stack, marginBottom: 20, gap: 14 }}>
              <section style={{
                position: "relative",
                overflow: "hidden",
                padding: viewportWidth < 560 ? "24px 20px" : "34px 36px",
                borderRadius: viewportWidth < 560 ? 24 : 30,
                color: "#fff",
                background: "linear-gradient(135deg, #0f3d5e 0%, #087ea4 52%, #10a37f 115%)",
                boxShadow: "0 22px 48px rgba(8, 126, 164, 0.24)",
              }}>
                <div aria-hidden="true" style={{
                  position: "absolute",
                  width: 220,
                  height: 220,
                  right: -74,
                  top: -92,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.10)",
                }} />
                <div aria-hidden="true" style={{
                  position: "absolute",
                  width: 130,
                  height: 130,
                  right: 62,
                  bottom: -86,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.08)",
                }} />
                <div style={{ position: "relative", maxWidth: 720 }}>
                  <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: "0.11em", textTransform: "uppercase", opacity: 0.86 }}>
                    Kalakauppa lähelläsi
                  </div>
                  <h2 style={{ margin: "8px 0 8px", fontSize: viewportWidth < 560 ? 31 : 43, lineHeight: 1.04, letterSpacing: "-0.035em" }}>
                    Tuoretta kalaa suoraan kalastajalta
                  </h2>
                  <div style={{ maxWidth: 580, fontSize: viewportWidth < 560 ? 16 : 18, lineHeight: 1.45, color: "rgba(255,255,255,0.88)" }}>
                    Löydä saatavilla olevat kalaerät, sovi toimitus ja hoida ostot yhdessä paikassa.
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20 }}>
                    <button
                      type="button"
                      onClick={() => openBuyerOfferCategory("open", "offers")}
                      style={{ ...styles.button, minHeight: 50, padding: "12px 20px", border: "1px solid #fff", background: "#fff", color: "#075985", fontWeight: 900, boxShadow: "0 10px 24px rgba(15, 23, 42, 0.18)" }}
                    >
                      Selaa kalaeriä →
                    </button>
                    {auctionsAvailable ? (
                      <button
                        type="button"
                        onClick={() => openBuyerTab("auctions")}
                        style={{ ...styles.button, minHeight: 50, padding: "12px 20px", border: "1px solid rgba(255,255,255,0.6)", background: "rgba(255,255,255,0.12)", color: "#fff", fontWeight: 850, backdropFilter: "blur(10px)" }}
                      >
                        Avaa huutokaupat
                      </button>
                    ) : null}
                  </div>
                </div>
              </section>

              <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "2px 1px 6px", scrollbarWidth: "none" }}>
                {[
                  { label: "Kaikki", value: "" },
                  ...(buyerLocationQuickFilter ? [{ label: `Lähellä: ${buyerLocationQuickFilter}`, value: buyerLocationQuickFilter }] : []),
                  { label: "Pyydetty tänään", value: today() },
                  ...buyerMarketplaceSpecies.map((species) => ({ label: species, value: species })),
                ].map((filter) => {
                  const isSelected = buyerOffersSearch.trim().toLocaleLowerCase("fi-FI") === filter.value.toLocaleLowerCase("fi-FI");
                  return (
                    <button
                      key={`${filter.label}-${filter.value}`}
                      type="button"
                      onClick={() => {
                        setBuyerOffersSearch(filter.value);
                        setBuyerOffersFilter("open");
                        scrollBuyerViewIntoPlace("buyer-offers-list");
                      }}
                      style={{
                        ...styles.button,
                        flex: "0 0 auto",
                        minHeight: 42,
                        padding: "9px 14px",
                        borderRadius: 999,
                        background: isSelected ? "#0f3d5e" : "#fff",
                        color: isSelected ? "#fff" : "#0f3d5e",
                        borderColor: isSelected ? "#0f3d5e" : "#bae6fd",
                        fontWeight: 800,
                      }}
                    >
                      {filter.label}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none" }}>
                {[
                  { title: "Uusia", count: buyerDashboardCounts.newOffers, color: "#1d4ed8", background: "#eff6ff", filter: "new", tab: "offers" },
                  { title: "Päätettävää", count: buyerDashboardCounts.requiresDecision, color: "#c2410c", background: "#fff7ed", filter: "decision", tab: "offers" },
                  { title: "Ostettu", count: buyerDashboardCounts.reservedAndPurchased, color: "#166534", background: "#f0fdf4", filter: "reserved_purchased", tab: "offers" },
                  { title: "Toimituksia", count: buyerDashboardCounts.incomingDeliveries, color: "#0f766e", background: "#f0fdfa", filter: "incoming", tab: "offers" },
                  { title: "Laskuja", count: buyerDashboardCounts.openInvoices, color: "#7e22ce", background: "#faf5ff", filter: "all", tab: "buyer_billing" },
                ].map((item) => (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => openBuyerOfferCategory(item.filter, item.tab)}
                    style={{
                      ...styles.button,
                      flex: viewportWidth < 620 ? "0 0 auto" : "1 1 0",
                      minWidth: viewportWidth < 620 ? 126 : 0,
                      minHeight: 66,
                      padding: "11px 13px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      textAlign: "left",
                      background: item.background,
                      borderColor: `${item.color}44`,
                      color: item.color,
                      boxShadow: "0 7px 18px rgba(15, 23, 42, 0.06)",
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 850 }}>{item.title}</span>
                    <span style={{ fontSize: 25, fontWeight: 950, lineHeight: 1 }}>{item.count}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {(activeTab === "offers" || activeTab === "dashboard") && acceptedBuyerOffers.length > 0 ? (
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
                  onClick={() => openBuyerOfferCategory("accepted", "offers")}
                >
                  Näytä hyväksytyt
                </button>
              </div>
            </div>
          ) : null}

          {activeTab === "offers" || activeTab === "dashboard" ? (
          <div id="buyer-offers-list" style={{ ...styles.stack, padding: viewportWidth < 560 ? 0 : 4 }}>
            <div style={styles.rowBetween}>
              <div>
                <div style={{ fontSize: viewportWidth < 560 ? 24 : 29, fontWeight: 900, color: "#0f172a", letterSpacing: "-0.025em" }}>
                  {activeTab === "dashboard" ? "Uusimmat kalaerät" : "Saatavilla olevat kalaerät"}
                </div>
                <div style={{ ...styles.muted, marginTop: 4 }}>Valitse sopiva erä tai rajaa näkymää haulla ja tilalla.</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["decision", "reserved_purchased", "incoming"].includes(buyerOffersFilter) ? (
                <button type="button" style={{ ...styles.button, ...styles.primaryButton, minHeight: 42, padding: "9px 14px", borderRadius: 999 }}>
                  {buyerOffersFilter === "decision" ? "Vaatii päätöksen" : buyerOffersFilter === "incoming" ? "Saapuvat toimitukset" : "Varatut ja ostetut"}
                </button>
              ) : null}
              {[
                { value: "new", label: "Uudet" },
                { value: "open", label: "Avoimet" },
                { value: "countered", label: "Vastatarjoukset" },
                { value: "reserved", label: "Varatut" },
                { value: "purchased", label: "Ostetut" },
                { value: "rejected", label: "Hylätyt" },
                { value: "all", label: "Kaikki" },
              ].map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setBuyerOffersFilter(filter.value)}
                  style={{
                    ...styles.button,
                    minHeight: 42,
                    padding: "9px 14px",
                    borderRadius: 999,
                    ...(buyerOffersFilter === filter.value ? styles.primaryButton : {}),
                  }}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <input
              style={{ ...styles.input, width: "100%", minWidth: 0, minHeight: 50, borderRadius: 16, background: "#fff", boxShadow: "0 8px 20px rgba(15, 23, 42, 0.05)" }}
              placeholder="Hae kalalajilla, alueella, päivällä tai myyjällä..."
              value={buyerOffersSearch}
              onChange={(e) => setBuyerOffersSearch(e.target.value)}
            />

            {filteredBuyerOffers.length === 0 ? (
              <div style={styles.muted}>Ei tarjottuja eriä.</div>
            ) : (
              orderedGroups.map(([dayLabel, offersForDay]) => (
                <div key={dayLabel} style={styles.stack}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
                    <strong style={{ flex: "0 0 auto", fontSize: 14, color: "#0f3d5e", letterSpacing: "0.025em" }}>{dayLabel}</strong>
                    <div style={{ height: 1, flex: 1, background: "linear-gradient(90deg, #bae6fd, rgba(186,230,253,0))" }} />
                  </div>

                  {offersForDay.map((o) => {
                    const isActive = buyerActiveOfferId === o.id;
                    const visiblePrice = getVisibleOfferPrice(o);
                    const sellerInfo = getBuyerVisibleSellerInfo(o);
                    const mixedOffer = isMixedOffer(o);
                    const offerHeadline = buildOfferHeadline(o);
                    const offerIsCrayfish = /rapu/i.test(offerHeadline);
                    const offerCountDisplay = getOfferCountDisplay(o);
                    const showTraceability = isBuyerOfferAccepted(o.status);
                    const visibleAdditionalNotes = extractVisibleAdditionalNotes(o.notes, {
                      hideDeliveryDestinations: o.status === "accepted",
                    });
                    const packaging = extractPackagingFromNotes(o.notes);
                    const ownDeliveryPrice = o.route_price_eur !== "" && o.route_price_eur != null ? Number(o.route_price_eur) : null;
                    const ownTotalPrice = o.total_price_eur !== "" && o.total_price_eur != null ? Number(o.total_price_eur) : null;
                    const ownDeliveredPricePerKg = o.delivered_price_per_kg !== "" && o.delivered_price_per_kg != null ? Number(o.delivered_price_per_kg) : null;
                    const offerTradeValue = Number(calculateCommissionDetails(o).tradeValue || 0);
                    const displayedTotalPrice = ownTotalPrice != null ? ownTotalPrice : (offerTradeValue > 0 ? offerTradeValue : null);
                    const offerCatchDates = getOfferSummaryCatchDates(o.species_summary);
                    const buyerOfferActionsOpen = hasBuyerOfferStatus(o.status, BUYER_OFFER_OPEN_RESPONSE_STATUSES);
                    const showCounterAction = isActive && buyerActionMode === "counter";
                    const acceptedNeedsReceipt = isBuyerOfferAccepted(o.status) && !["delivered", "received"].includes(String(o.fulfillment_status || ""));
                    const acceptedInvoiceReady = isBuyerOfferAccepted(o.status) && ["invoiced", "paid"].includes(String(o.billing_status || ""));
                    const offerInlineError = buyerOfferInlineError.offerId === String(o?.id || "") ? buyerOfferInlineError.message : "";
                    return (
                      <div id={`buyer-offer-card-${o.id}`} key={o.id} style={{
                        ...styles.entry,
                        padding: viewportWidth < 560 ? 16 : 22,
                        border: "1px solid #dbeafe",
                        borderRadius: viewportWidth < 560 ? 21 : 26,
                        background: "linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)",
                        boxShadow: "0 16px 38px rgba(15, 61, 94, 0.10)",
                        ...(focusedFixedOfferId === String(o.id) ? { border: "2px solid #2563eb", boxShadow: "0 0 0 4px rgba(37, 99, 235, 0.16), 0 18px 42px rgba(15,61,94,0.15)" } : {}),
                      }}>
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 13, marginBottom: 13 }}>
                            <div aria-hidden="true" style={{
                              flex: "0 0 auto",
                              width: viewportWidth < 560 ? 48 : 56,
                              height: viewportWidth < 560 ? 48 : 56,
                              display: "grid",
                              placeItems: "center",
                              borderRadius: 18,
                              background: offerIsCrayfish ? "linear-gradient(135deg, #fff7ed, #ffedd5)" : "linear-gradient(135deg, #e0f2fe, #ccfbf1)",
                              fontSize: viewportWidth < 560 ? 27 : 31,
                              boxShadow: "inset 0 0 0 1px rgba(14,116,144,0.10)",
                            }}>
                              {offerIsCrayfish ? "🦞" : "🐟"}
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 5 }}>
                                {o.status === "sent" ? <span style={{ ...styles.badge, background: "#dbeafe", borderColor: "#93c5fd", color: "#1d4ed8", fontSize: 11, fontWeight: 900 }}>UUSI</span> : null}
                                <span style={{ fontSize: 12, color: "#64748b" }}>{formatOfferDate(o.updated_at || o.created_at)}</span>
                              </div>
                              <div style={{ fontSize: viewportWidth < 560 ? 23 : 28, fontWeight: 900, lineHeight: 1.08, color: "#0f172a", letterSpacing: "-0.025em" }}>{offerHeadline}</div>
                            </div>
                          </div>
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
                              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                <div style={{ fontSize: viewportWidth < 560 ? 22 : 25, fontWeight: 950, color: "#08775f", letterSpacing: "-0.02em" }}>
                                  {euro(visiblePrice)} / {getOfferDisplayUnit(o)} <span style={{ fontSize: 13, fontWeight: 750, color: "#64748b" }}>ALV 0 %</span>
                                </div>
                                <div style={{ fontSize: 14, fontWeight: 750, color: "#64748b" }}>
                                  {euro(calculateGrossPrice(visiblePrice) || 0)} / {getOfferDisplayUnit(o)} sis. ALV {formatVatPercent()} %
                                </div>
                                {offerCatchDates.length > 0 ? (
                                  <div style={{ marginTop: 4, fontSize: 15, fontWeight: 800, color: "#334155" }}>
                                    Pyydetty {offerCatchDates.join(", ")}
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
                          {showTraceability && o.batch_id && !mixedOffer ? (
                            <div style={{ display: "flex", gap: 12, alignItems: "stretch", flexWrap: "wrap", marginBottom: 8 }}>
                              <div style={styles.qrBlock}>
                                <img src={getBatchQrImageUrl(o.batch_id)} alt={`QR ${o.batch_id}`} style={styles.qrImage} />
                                <div style={styles.small}>QR-koodi erälle</div>
                              </div>
                            </div>
                          ) : null}
                          <div style={styles.entryBadges}>
                            {o.status !== "sent" ? <span style={styles.badge}>{buyerStatusLabel(o.status)}</span> : null}
                            {o.status === "reserved" ? <span style={{ ...styles.badge, background: "#fff7ed", borderColor: "#fdba74" }}>Varaus käynnissä</span> : null}
                            {o.status === "countered" ? <span style={{ ...styles.badge, background: "#eff6ff", borderColor: "#93c5fd", color: "#1d4ed8" }}>Vastatarjous lähetetty</span> : null}
                            {o.status === "sold" ? <span style={{ ...styles.badge, background: "#fee2e2", borderColor: "#fca5a5", color: "#b91c1c" }}>MYYTY JO TOISELLE OSTAJALLE</span> : null}
                            <span style={styles.badge}>Tarjoaja: {sellerInfo.sellerLabel}</span>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: viewportWidth < 560 ? "repeat(2, minmax(0, 1fr))" : "repeat(3, minmax(0, 1fr))", gap: 9, marginTop: 13 }}>
                            {[
                              ["Määrä", getOfferQuantityDisplay(o)],
                              ["Kokonaishinta", displayedTotalPrice != null ? formatDeliveryPrice(displayedTotalPrice) : "-"],
                              ["Alue", sellerInfo.publicLocation || o.area || "-"],
                              ["Pyyntipäivä", offerCatchDates.length > 0 ? offerCatchDates.join(", ") : "-"],
                              ["Aikaisin toimitus", sellerInfo.earliestDeliveryDate || "-"],
                              ["Toimitustapa", sellerInfo.deliveryMethod || "-"],
                            ].map(([label, value]) => (
                              <div key={label} style={{ padding: viewportWidth < 560 ? 10 : 12, borderRadius: 15, background: label === "Määrä" || label === "Kokonaishinta" ? "#f0fdfa" : "#f8fafc", border: `1px solid ${label === "Määrä" || label === "Kokonaishinta" ? "#99f6e4" : "#e2e8f0"}`, minWidth: 0 }}>
                                <div style={{ color: "#64748b", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
                                <div style={{ marginTop: 4, color: "#0f172a", fontSize: label === "Määrä" || label === "Kokonaishinta" ? 17 : 14, fontWeight: 850, overflowWrap: "anywhere" }}>{value}</div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {isActive && buyerActionMode === "details" ? (
                        <div style={{ ...(viewportWidth < 768 ? { display: "grid", gridTemplateColumns: "1fr", gap: 18 } : styles.grid2), margin: "16px 0 10px", padding: 15, borderRadius: 17, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
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
                            {!mixedOffer && offerCountDisplay ? (
                              <div style={styles.muted}>
                                {isCrayfishOfferSummary(o.species_summary) ? "Kappalemäärä" : "Kaloja keskimäärin"}: {offerCountDisplay}
                              </div>
                            ) : null}
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
                            {packaging ? <div style={styles.muted}><strong>Pakkaustapa:</strong> {packaging}</div> : null}
                            <div style={styles.muted}>Toimitustapa: {sellerInfo.deliveryMethod || "-"}</div>
                            <div style={styles.muted}>Kulu: {ownDeliveryPrice != null ? formatDeliveryPrice(ownDeliveryPrice) : (sellerInfo.deliveryCost !== "" && sellerInfo.deliveryCost != null ? `${sellerInfo.deliveryCost} €` : "-")}</div>
                            <div style={styles.muted}>Aikaisin toimitus: {sellerInfo.earliestDeliveryDate || "-"}</div>
                            <div style={styles.muted}>Kylmäkuljetus: {sellerInfo.coldTransport ? "kyllä" : "ei"}</div>
                            {visibleAdditionalNotes ? <div style={{ ...styles.muted, whiteSpace: "pre-wrap" }}>{visibleAdditionalNotes}</div> : <div style={styles.muted}>Ei lisätietoja</div>}
                          </div>
                        </div>
                        ) : null}

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
                                  background: "linear-gradient(135deg, #059669, #16a34a)",
                                  borderColor: "#047857",
                                  color: "#ffffff",
                                  fontWeight: 900,
                                  boxShadow: "0 9px 20px rgba(5, 150, 105, 0.22)",
                                }}
                                onClick={async () => {
                                  if (buyerTradeProfileIncomplete) {
                                    setAccountPanelOpen(true);
                                    setBuyerOfferInlineError({
                                      offerId: String(o?.id || ""),
                                      message: `Täytä omat tiedot ennen kuin voit ostaa erän. Puuttuvat tiedot: ${missingBuyerTradeFields.join(", ")}.`,
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
                                Osta erä
                              </button>
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
                                type="button"
                                style={{
                                  ...styles.button,
                                  background: "#ffffff",
                                  borderColor: "#cbd5e1",
                                  color: "#334155",
                                  fontWeight: 800,
                                }}
                                onClick={() => {
                                  const detailsOpen = isActive && buyerActionMode === "details";
                                  setBuyerOfferInlineError({ offerId: "", message: "" });
                                  setBuyerActionMode("details");
                                  setBuyerActiveOfferId(detailsOpen ? null : o.id);
                                }}
                              >
                                {isActive && buyerActionMode === "details" ? "Sulje tiedot" : "Näytä tiedot"}
                              </button>
                            </>
                          ) : acceptedInvoiceReady ? (
                            <button
                              style={{ ...styles.button, ...styles.primaryButton, fontWeight: 900 }}
                              onClick={() => openBuyerTab("buyer_billing", "buyer-invoices-view")}
                            >
                              Avaa lasku
                            </button>
                          ) : acceptedNeedsReceipt ? (
                            <button
                              style={{ ...styles.button, background: "linear-gradient(135deg, #0f766e, #0d9488)", borderColor: "#0f766e", color: "#fff", fontWeight: 900 }}
                              onClick={() => updateFulfillmentStatus(o, "delivered")}
                            >
                              Kuittaa vastaanotetuksi
                            </button>
                          ) : (
                            <button style={styles.button} onClick={() => {
                              const detailsOpen = isActive && buyerActionMode === "details";
                              setBuyerOfferInlineError({ offerId: "", message: "" });
                              setBuyerActionMode("details");
                              setBuyerActiveOfferId(detailsOpen ? null : o.id);
                            }}>
                              {isActive && buyerActionMode === "details" ? "Sulje tiedot" : isBuyerOfferAccepted(o.status) ? "Näytä kaupan tiedot" : "Näytä tiedot"}
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

          {viewportWidth < 620 ? (
            <nav
              aria-label="Ostajan päänavigointi"
              style={{
                position: "fixed",
                left: "max(10px, env(safe-area-inset-left))",
                right: "max(10px, env(safe-area-inset-right))",
                bottom: "max(10px, env(safe-area-inset-bottom))",
                zIndex: 40,
                display: "grid",
                gridTemplateColumns: `repeat(${auctionsAvailable ? 5 : 4}, minmax(0, 1fr))`,
                gap: 4,
                padding: 7,
                border: "1px solid rgba(148, 163, 184, 0.34)",
                borderRadius: 22,
                background: "rgba(255,255,255,0.96)",
                boxShadow: "0 18px 46px rgba(15, 23, 42, 0.22)",
                backdropFilter: "blur(18px)",
              }}
            >
              {[
                { id: "dashboard", label: "Aloitus", icon: "⌂", onClick: () => openBuyerTab("dashboard") },
                { id: "offers", label: "Kalaerät", icon: "◉", onClick: () => openBuyerOfferCategory("open", "offers") },
                ...(auctionsAvailable ? [{ id: "auctions", label: "Huutok.", icon: "◇", onClick: () => openBuyerTab("auctions") }] : []),
                { id: "reports", label: "Raportit", icon: "▥", onClick: () => openBuyerTab("reports") },
                { id: "buyer_billing", label: "Laskut", icon: "€", onClick: () => openBuyerTab("buyer_billing", "buyer-invoices-view") },
              ].map((item) => {
                const isCurrent = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={isCurrent ? "page" : undefined}
                    onClick={item.onClick}
                    style={{
                      minWidth: 0,
                      minHeight: 58,
                      padding: "6px 2px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 2,
                      border: "none",
                      borderRadius: 16,
                      background: isCurrent ? "linear-gradient(135deg, #0f3d5e, #087ea4)" : "transparent",
                      color: isCurrent ? "#ffffff" : "#475569",
                      fontFamily: "inherit",
                      cursor: "pointer",
                      boxShadow: isCurrent ? "0 7px 16px rgba(8, 126, 164, 0.22)" : "none",
                    }}
                  >
                    <span aria-hidden="true" style={{ fontSize: 20, fontWeight: 900, lineHeight: 1 }}>{item.icon}</span>
                    <span style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", fontSize: auctionsAvailable ? 10 : 11, fontWeight: 850, whiteSpace: "nowrap" }}>{item.label}</span>
                  </button>
                );
              })}
            </nav>
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
        alignItems: "center",
        overflowX: "auto",
        overflowY: "hidden",
        WebkitOverflowScrolling: "touch",
        scrollBehavior: "smooth",
        scrollSnapType: "x proximity",
        scrollPaddingInline: 52,
        padding: 10,
        gap: 6,
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
        whiteSpace: "nowrap",
      }
    : styles.tab;
  const visibleTabIds = [
    "dashboard",
    ...(profile.role !== "buyer" ? ["add", "offers", "entries"] : ["offers"]),
    ...(auctionsAvailable && ["member", "owner"].includes(profile.role) ? ["auctions"] : []),
    "reports",
    ...(profile.role === "member" ? ["billing"] : []),
    ...(profile.role === "owner" ? ["operations", "buyers", "users", "billing"] : []),
  ];
  const visibleTabLabels = {
    dashboard: "Aloitus",
    add: profile.role === "processor" ? "Lisää jaloste-erä" : "Lisää saalis",
    entries: profile.role === "processor" ? "Jaloste-erät" : "Saaliit",
    offers: "Tarjoukset",
    auctions: "Huutokaupat",
    reports: "Raportit",
    billing: "Laskutus",
    operations: "Ylläpito",
    buyers: "Ostajat",
    users: "Käyttäjät",
  };
  const currentVisibleTabIndex = visibleTabIds.indexOf(activeTab);
  const currentVisibleTab = currentVisibleTabIndex >= 0 ? visibleTabIds[currentVisibleTabIndex] : visibleTabIds[0];
  const getVisibleTabButtonStyle = (tabId) => {
    const isActive = tabId === currentVisibleTab;
    if (!isCompactTabs) {
      return { ...visibleSingleTabStyle, ...(isActive ? styles.activeTab : {}) };
    }

    return {
      ...visibleSingleTabStyle,
      minWidth: 128,
      minHeight: 50,
      padding: "10px 14px",
      fontSize: 15,
      opacity: 1,
      scrollSnapAlign: "start",
      scrollMarginInlineStart: 52,
      transition: "background 180ms ease, color 180ms ease, border-color 180ms ease, box-shadow 180ms ease",
      ...(isActive ? styles.activeTab : {}),
    };
  };
  const handleVisibleTabChange = (tabId) => {
    if (!tabId) return;

    if (tabId !== "entries") setSalesSelectionMode(false);
    setActiveTab(tabId);
    if (tabId === "billing") setRefreshTick((prev) => prev + 1);

    window.requestAnimationFrame(() => {
      const tabsContainer = tabsScrollRef.current;
      const tabButton = tabsContainer?.querySelector(`[data-tab-id="${tabId}"]`);
      if (!tabsContainer || !tabButton) return;

      const leftArrowClearance = tabId === visibleTabIds[0] ? 10 : 54;
      const targetLeft = tabButton.offsetLeft - leftArrowClearance;
      tabsContainer.scrollTo({ left: Math.max(0, targetLeft), behavior: "smooth" });
    });
  };
  const handleTabCarouselStep = (direction) => {
    const nextTabIndex = currentVisibleTabIndex + direction;
    if (nextTabIndex < 0 || nextTabIndex >= visibleTabIds.length) return;
    handleVisibleTabChange(visibleTabIds[nextTabIndex]);
  };
  const updateTabCarouselEdges = (element = tabsScrollRef.current) => {
    if (!element) return;
    const nextEdges = {
      canScrollLeft: element.scrollLeft > 4,
      canScrollRight: element.scrollLeft < element.scrollWidth - element.clientWidth - 4,
    };
    setTabCarouselEdges((previous) => (
      previous.canScrollLeft === nextEdges.canScrollLeft && previous.canScrollRight === nextEdges.canScrollRight
        ? previous
        : nextEdges
    ));
  };
  const handleTabCarouselArrow = (direction) => {
    const tabsContainer = tabsScrollRef.current;
    if (direction < 0 && currentVisibleTabIndex <= 0) {
      tabsContainer?.scrollTo({ left: 0, behavior: "smooth" });
      return;
    }
    if (direction > 0 && currentVisibleTabIndex >= visibleTabIds.length - 1) {
      tabsContainer?.scrollTo({ left: tabsContainer.scrollWidth, behavior: "smooth" });
      return;
    }
    handleTabCarouselStep(direction);
  };
  const handleOpenCatchSales = () => {
    if (profile.role === "processor") {
      handleVisibleTabChange("add");
      return;
    }

    setSearch("");
    setSalesSelectionMode(true);
    setPendingEntriesScrollTarget("sales");
    handleVisibleTabChange("entries");
  };
  const handleOpenConsumerSale = () => {
    setAuthError("");
    setAuthInfo("");
    setForm((previous) => ({
      ...previous,
      saleMode: "consumer",
      listForSale: true,
      offerToShops: false,
      offerToRestaurants: false,
      offerToWholesalers: false,
      selectedBuyerIds: [],
      deliveryPossible: false,
      deliveryMethod: "Nouto",
      deliveryArea: savedPickupAddress,
      deliveryDestinations: [],
      consumerPickupLocation: previous.consumerPickupLocation || savedPickupAddress,
    }));
    handleVisibleTabChange("add");
  };
  const handleOpenCatchAuction = () => {
    if (!auctionsAvailable) {
      setAuthError("Huutokauppa ei ole juuri nyt käytettävissä.");
      return;
    }

    setAuctionCreateRequestKey(Date.now());
    handleVisibleTabChange("auctions");
  };
  const grid3 = responsiveGridStyle(styles.grid3, viewportWidth);
  const grid2 = responsiveGridStyle(styles.grid2, viewportWidth);
  const formGrid = responsiveGridStyle(styles.formGrid, viewportWidth);
  const speciesRow = responsiveGridStyle(styles.speciesRow, viewportWidth);
  const fisherPremiumRequired = profile.role === "member" && !hasFisherPremium;
  const headerBrandStyles = getHeaderBrandStyles(viewportWidth);
  const isIosMobileApp = viewportWidth < 768 && isNativeIosApp();

  return (
    <div style={{
      ...styles.app,
      paddingBottom: "max(96px, calc(76px + env(safe-area-inset-bottom)))",
      ...(isIosMobileApp ? {
        padding: "64px 12px max(96px, calc(76px + env(safe-area-inset-bottom)))",
        minHeight: "100dvh",
      } : {}),
    }}>
      <div style={styles.container}>
        <div style={{ ...styles.card, ...styles.headerCard, position: "relative", paddingRight: viewportWidth < 560 ? styles.headerCard.padding : 76 }}>
          <button
            type="button"
            aria-label="Avaa sovelluksen käyttöohje"
            title="Käyttöohje"
            onClick={() => setHelpOpen(true)}
            style={{
              position: "absolute",
              top: viewportWidth < 560 ? 12 : 18,
              right: viewportWidth < 560 ? 12 : 18,
              width: viewportWidth < 560 ? 38 : 44,
              height: viewportWidth < 560 ? 38 : 44,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid #93c5fd",
              borderRadius: 999,
              background: "#eff6ff",
              color: "#1d4ed8",
              fontSize: viewportWidth < 560 ? 22 : 25,
              fontFamily: "Georgia, serif",
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: "0 6px 16px rgba(37, 99, 235, 0.12)",
            }}
          >
            i
          </button>
          <div style={styles.rowBetween}>
            <div>
              <div style={{ ...headerBrandStyles.row, ...(viewportWidth < 560 ? { marginTop: 12 } : {}) }}>
                <h1 style={headerBrandStyles.title}>Suoraan Kalastajalta</h1>
                <img
                  src="/logo.png"
                  alt=""
                  style={{
                    ...headerBrandStyles.logo,
                    ...(viewportWidth < 560
                      ? { width: "clamp(112px, 30vw, 132px)", maxWidth: "clamp(112px, 30vw, 132px)" }
                      : {}),
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
        {helpOpen ? <HelpDialog role={profile.role} onClose={() => setHelpOpen(false)} /> : null}
        <PersistentAppNavigation
          onHome={handleGoToHome}
          viewportWidth={viewportWidth}
          hidden={Boolean(catchSaleEntry || labelPrintEntry)}
        />

        {accountPanelOpen ? (
          <div id="account-details-panel" style={{ ...styles.card, ...styles.sectionCard, ...styles.stack, marginBottom: 16 }}>
            <div style={styles.rowBetween}>
              <div>
                <strong>Omat tiedot</strong>
                <div style={styles.muted}>
                  {profile.role === "processor"
                    ? "Päivitä oma nimi, vesiviljelylaitoksen laitosnumero ja salasana."
                    : "Päivitä oma nimi, yrityksen tiedot ja tarvittaessa laitostunnus etikettiä varten."}
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
                <>
                  <div style={{ ...styles.noticeInfo, ...(hasFisherPremium ? styles.noticeSuccess : styles.noticeWarning) }}>
                    <strong>{hasFisherPremium ? "Kalastajan Premium aktiivinen." : "Kalastajan Premium ei ole aktiivinen."}</strong>{" "}
                    {hasFisherPremium
                      ? "Voit käyttää jäljitettävyystunnuksia, etikettien tulostusta, myyntiin tarjoamista ja virallista saalisilmoitusta."
                      : "Ilmaisversiossa voit kirjata ja selata saaliita. Premium avaa myynnin, jäljitettävyyden, etiketit ja virallisen saalisilmoituksen."}
                  </div>
                  {!hasFisherPremium && (isGooglePlayBillingAvailable() || isAppleStoreKitAvailable()) ? (
                    <div style={{ ...styles.row, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        style={{ ...styles.button, ...styles.primaryButton }}
                        disabled={premiumPurchaseBusy}
                        onClick={handlePurchaseFisherPremium}
                      >
                        {premiumPurchaseBusy ? "Käsitellään…" : "Osta Premium 12,99 €/kk (sis. ALV)"}
                      </button>
                      <button type="button" style={styles.button} disabled={premiumPurchaseBusy} onClick={handleRestoreFisherPremium}>
                        Palauta ostos
                      </button>
                    </div>
                  ) : null}
                  {hasFisherPremium && showAppleStoreKitTestPurchase ? (
                    <div style={{ ...styles.stack, gap: 8 }}>
                      <div style={styles.muted}>
                        Xcode-testi: kampanja-Premium on aktiivinen, mutta voit silti kokeilla Applen paikallista ostoruutua. Testi ei muuta käyttäjätilin oikeuksia.
                      </div>
                      <button
                        type="button"
                        style={{ ...styles.button, ...styles.primaryButton }}
                        disabled={premiumPurchaseBusy}
                        onClick={handleTestApplePremiumPurchase}
                      >
                        {premiumPurchaseBusy ? "Käsitellään…" : "Testaa App Store -osto 12,99 €/kk"}
                      </button>
                    </div>
                  ) : null}
                  {hasActiveGooglePlayFisherPremium && isGooglePlayBillingAvailable() ? (
                    <a
                      href={getFisherPremiumManagementUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ ...styles.button, display: "inline-flex", alignItems: "center", textDecoration: "none" }}
                    >
                      Hallinnoi Google Play -tilausta
                    </a>
                  ) : null}
                  {hasActiveAppleFisherPremium && isAppleStoreKitAvailable() ? (
                    <a
                      href={getAppleFisherPremiumManagementUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ ...styles.button, display: "inline-flex", alignItems: "center", textDecoration: "none" }}
                    >
                      Hallinnoi App Store -tilausta
                    </a>
                  ) : null}
                  {!hasFisherPremium && !isGooglePlayBillingAvailable() && !isAppleStoreKitAvailable() ? (
                    <div style={styles.muted}>Premium-tilauksen voi ostaa Suoraan Kalastajalta -Android- tai iPhone-sovelluksessa.</div>
                  ) : null}
                </>
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
                  <div style={styles.field}>
                    <label>Laitostunnus (valinnainen)</label>
                    <input style={styles.input} value={accountForm.eviraFacilityId} onChange={(e) => setAccountForm((prev) => ({ ...prev, eviraFacilityId: e.target.value }))} placeholder="Esim. F12345" />
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
            {isAppleStoreKitAvailable() ? (
              <AccountDeletionCard onDeleteAccount={handleDeleteOwnAccount} busy={accountDeletionBusy} />
            ) : null}
          </div>
        ) : null}

        {(visibleAuthError || authInfo || authWarning) ? (
          <div style={{
            ...styles.toastStack,
            ...(isIosMobileApp ? {
              top: 64,
              right: 12,
              maxHeight: "calc(100dvh - 84px)",
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
            } : {}),
          }}>
            {visibleAuthError ? (
              <div style={{ ...styles.noticeError, ...styles.toastCard }}>
                {visibleAuthError}
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

        <div style={{ ...styles.stickyTabsWrap, position: "sticky", top: isIosMobileApp ? 116 : viewportWidth < 560 ? 70 : 76 }}>
          <div style={{ position: "relative" }}>
            {isCompactTabs && (currentVisibleTabIndex > 0 || tabCarouselEdges.canScrollLeft) ? (
              <button
                type="button"
                aria-label={currentVisibleTabIndex > 0 ? `Siirry edelliselle välilehdelle: ${visibleTabLabels[visibleTabIds[currentVisibleTabIndex - 1]]}` : "Vieritä välilehtivalikko alkuun"}
                title={currentVisibleTabIndex > 0 ? `Edellinen: ${visibleTabLabels[visibleTabIds[currentVisibleTabIndex - 1]]}` : "Valikon alkuun"}
                onClick={() => handleTabCarouselArrow(-1)}
                style={{
                  position: "absolute",
                  zIndex: 4,
                  left: 0,
                  top: 6,
                  bottom: 6,
                  width: 42,
                  padding: 0,
                  border: 0,
                  borderRadius: "16px 0 0 16px",
                  background: "linear-gradient(90deg, rgba(255,255,255,1) 35%, rgba(255,255,255,0.9) 70%, rgba(255,255,255,0))",
                  color: "#1d4ed8",
                  fontSize: 30,
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                ‹
              </button>
            ) : null}
            <div ref={tabsScrollRef} style={visibleTabStyle} aria-label="Sovelluksen näkymät" onScroll={(event) => updateTabCarouselEdges(event.currentTarget)}>
              {visibleTabIds.map((tabId) => (
                <button
                  key={tabId}
                  type="button"
                  data-tab-id={tabId}
                  aria-current={tabId === currentVisibleTab ? "page" : undefined}
                  style={getVisibleTabButtonStyle(tabId)}
                  onClick={() => handleVisibleTabChange(tabId)}
                >
                  {visibleTabLabels[tabId]}
                </button>
              ))}
            </div>
            {isCompactTabs && currentVisibleTabIndex >= 0 && (currentVisibleTabIndex < visibleTabIds.length - 1 || tabCarouselEdges.canScrollRight) ? (
              <button
                type="button"
                aria-label={currentVisibleTabIndex < visibleTabIds.length - 1 ? `Siirry seuraavalle välilehdelle: ${visibleTabLabels[visibleTabIds[currentVisibleTabIndex + 1]]}` : "Vieritä välilehtivalikko loppuun"}
                title={currentVisibleTabIndex < visibleTabIds.length - 1 ? `Seuraava: ${visibleTabLabels[visibleTabIds[currentVisibleTabIndex + 1]]}` : "Valikon loppuun"}
                onClick={() => handleTabCarouselArrow(1)}
                style={{
                  position: "absolute",
                  zIndex: 4,
                  right: 0,
                  top: 6,
                  bottom: 6,
                  width: 42,
                  padding: 0,
                  border: 0,
                  borderRadius: "0 16px 16px 0",
                  background: "linear-gradient(270deg, rgba(255,255,255,1) 35%, rgba(255,255,255,0.9) 70%, rgba(255,255,255,0))",
                  color: "#1d4ed8",
                  fontSize: 30,
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                ›
              </button>
            ) : null}
          </div>
        </div>

        {activeTab === "dashboard" ? (
          <div style={styles.stack}>
            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
              <div>
                <div style={{ fontSize: viewportWidth < 560 ? 24 : 28, fontWeight: 900, color: "#0f172a" }}>Aloitus</div>
                <div style={styles.muted}>
                  {profile.role === "processor"
                    ? "Kirjaa uusi jaloste-erä tai aseta jaloste myyntiin."
                    : "Valitse tärkein tehtävä: kirjaa uusi saalis tai myy jo kirjattu kalaerä."}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
                <button
                  type="button"
                  style={{
                    ...styles.button,
                    ...styles.primaryButton,
                    minHeight: 92,
                    padding: 16,
                    alignItems: "flex-start",
                    justifyContent: "flex-start",
                    textAlign: "left",
                  }}
                  onClick={() => handleVisibleTabChange("add")}
                >
                  <span style={{ display: "flex", width: "100%", flexDirection: "column", alignItems: "flex-start", gap: 5 }}>
                    <strong style={{ fontSize: 19 }}>{profile.role === "processor" ? "Kirjaa jaloste-erä" : "Kirjaa uusi saalis"}</strong>
                    <span style={{ fontSize: 13, fontWeight: 700, opacity: 0.88 }}>
                      {profile.role === "processor" ? "Tallenna uusi valmistettu erä." : "Tallenna pyyntitiedot ja uusi kalaerä."}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  style={{
                    ...styles.button,
                    minHeight: 92,
                    padding: 16,
                    alignItems: "flex-start",
                    justifyContent: "flex-start",
                    textAlign: "left",
                    borderColor: "#047857",
                    background: "linear-gradient(135deg, #059669, #16a34a)",
                    color: "#ffffff",
                    boxShadow: "0 10px 22px rgba(5, 150, 105, 0.22)",
                  }}
                  onClick={handleOpenCatchSales}
                >
                  <span style={{ display: "flex", width: "100%", flexDirection: "column", alignItems: "flex-start", gap: 5 }}>
                    <strong style={{ fontSize: 19 }}>{profile.role === "processor" ? "Myy jaloste-erä" : "Myy saalis yritysostajille"}</strong>
                    <span style={{ fontSize: 13, fontWeight: 700, opacity: 0.9 }}>
                      {profile.role === "processor" ? "Kirjaa erä ja tarjoa sitä ostajille." : "Valitse kirjattu erä ja tarjoa sitä yritysostajille kiinteällä hinnalla."}
                    </span>
                  </span>
                </button>
                {["member", "owner"].includes(profile.role) ? (
                  <button
                    type="button"
                    style={{
                      ...styles.button,
                      minHeight: 92,
                      padding: 16,
                      alignItems: "flex-start",
                      justifyContent: "flex-start",
                      textAlign: "left",
                      borderColor: "#0891b2",
                      background: "linear-gradient(135deg, #0891b2, #0e7490)",
                      color: "#ffffff",
                      boxShadow: "0 10px 22px rgba(8, 145, 178, 0.22)",
                    }}
                    onClick={handleOpenConsumerSale}
                  >
                    <span style={{ display: "flex", width: "100%", flexDirection: "column", alignItems: "flex-start", gap: 5 }}>
                      <strong style={{ fontSize: 19 }}>Myy suoraan kuluttajalle</strong>
                      <span style={{ fontSize: 13, fontWeight: 700, opacity: 0.9 }}>
                        Kirjaa uusi saalis ja julkaise se vain kuluttajamarkkinapaikalle.
                      </span>
                    </span>
                  </button>
                ) : null}
                {["member", "owner"].includes(profile.role) ? (
                  <button
                    type="button"
                    disabled={!auctionsAvailable}
                    style={{
                      ...styles.button,
                      minHeight: 92,
                      padding: 16,
                      alignItems: "flex-start",
                      justifyContent: "flex-start",
                      textAlign: "left",
                      borderColor: "#6d28d9",
                      background: auctionsAvailable ? "linear-gradient(135deg, #7c3aed, #4f46e5)" : "#e2e8f0",
                      color: auctionsAvailable ? "#ffffff" : "#64748b",
                      boxShadow: auctionsAvailable ? "0 10px 22px rgba(109, 40, 217, 0.22)" : "none",
                      cursor: auctionsAvailable ? "pointer" : "not-allowed",
                    }}
                    onClick={handleOpenCatchAuction}
                  >
                    <span style={{ display: "flex", width: "100%", flexDirection: "column", alignItems: "flex-start", gap: 5 }}>
                      <strong style={{ fontSize: 19 }}>Myy saalis huutokaupassa</strong>
                      <span style={{ fontSize: 13, fontWeight: 700, opacity: 0.9 }}>
                        {auctionsAvailable ? "Valitse kirjattu erä ja anna ostajien huutaa siitä." : "Huutokauppa ei ole juuri nyt käytettävissä."}
                      </span>
                    </span>
                  </button>
                ) : null}
              </div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#0f172a", padding: "4px 2px 0" }}>
              {profile.role === "processor" ? "Yhteenveto omista jaloste-eristä" : "Yhteenveto omista saaliista"}
            </div>
            <div style={grid3}>
              <div style={{ ...styles.card, ...styles.sectionCard }}>
                <div style={styles.metric}>{profile.role === "processor" ? `${totals.totalProcessedKg.toFixed(1)} kg` : `${totals.totalKg.toFixed(1)} kg`}</div>
                {profile.role !== "processor" && totals.totalPieces > 0 ? <div style={{ ...styles.metric, fontSize: 24 }}>{totals.totalPieces.toLocaleString("fi-FI")} kpl rapuja</div> : null}
                <div style={styles.muted}>{profile.role === "processor" ? "Jalosteita yhteensä" : "Kokonaissaalis"}</div>
              </div>
              <div style={{ ...styles.card, ...styles.sectionCard }}>
                <div style={styles.metric}>{profile.role === "processor" ? `${totals.processedForSaleKg.toFixed(1)} kg` : `${totals.forSaleKg.toFixed(1)} kg`}</div>
                {profile.role !== "processor" && totals.forSalePieces > 0 ? <div style={{ ...styles.metric, fontSize: 24 }}>{totals.forSalePieces.toLocaleString("fi-FI")} kpl rapuja</div> : null}
                <div style={styles.muted}>Tarjolla ostajille</div>
              </div>
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
                      <div style={styles.rowBetween}><span>{item.species}</span><span>{item.unit === "kpl" ? item.quantity.toLocaleString("fi-FI") : item.quantity.toFixed(1)} {item.unit}</span></div>
                      <div style={styles.progress}><span style={{ ...styles.progressFill, width: `${Math.max((item.quantity / Math.max(item.unit === "kpl" ? totals.totalPieces : totals.totalKg, 1)) * 100, 4)}%` }} /></div>
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
                <div style={styles.field}><label>Tuotantopäivä</label><input style={{ ...styles.input, ...styles.dateInput }} type="date" value={processedForm.productionDate} onChange={(e) => setProcessedForm({ ...processedForm, productionDate: e.target.value })} /></div>
                <div style={styles.field}><label>Parasta ennen</label><input style={{ ...styles.input, ...styles.dateInput }} type="date" value={processedForm.bestBeforeDate} onChange={(e) => setProcessedForm({ ...processedForm, bestBeforeDate: e.target.value })} /></div>
                <div style={styles.field}><label>Viimeinen käyttöpäivä</label><input style={{ ...styles.input, ...styles.dateInput }} type="date" value={processedForm.useByDate} onChange={(e) => setProcessedForm({ ...processedForm, useByDate: e.target.value })} /></div>
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
                <div style={styles.field}><label>Aikaisin toimitus</label><input style={{ ...styles.input, ...styles.dateInput }} type="date" value={processedForm.earliestDeliveryDate} onChange={(e) => setProcessedForm({ ...processedForm, earliestDeliveryDate: e.target.value })} /></div>
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
                    <div style={styles.field}><label>Toimitustapa</label><select style={styles.input} value={processedForm.deliveryMethod} onChange={(e) => {
                      const nextMethod = e.target.value;
                      setProcessedForm((prev) => ({
                        ...prev,
                        deliveryMethod: nextMethod,
                        deliveryArea: resolveOfferDeliveryArea(
                          nextMethod,
                          prev.deliveryArea,
                          prev.deliveryDestinations,
                          savedPickupAddress,
                        ),
                      }));
                    }}>{deliveryMethods.map((method) => <option key={method} value={method}>{method}</option>)}</select></div>
                    <div style={styles.field}>
                      <label>{processedForm.deliveryMethod === "Nouto" ? "Nouto-osoite" : "Toimitusalue"}</label>
                      {processedForm.deliveryMethod === "Nouto" ? (
                        <input style={styles.input} value={resolveOfferDeliveryArea(processedForm.deliveryMethod, processedForm.deliveryArea, processedForm.deliveryDestinations, savedPickupAddress)} onChange={(e) => setProcessedForm({ ...processedForm, deliveryArea: e.target.value })} placeholder="Esim. Jalostamontie 4, Lappeenranta" />
                      ) : (
                        <MultiCityInput
                          value={processedForm.deliveryDestinations}
                          onChange={(cities) => setProcessedForm((prev) => ({
                            ...prev,
                            deliveryDestinations: normalizeDestinationCities(cities),
                            deliveryArea: formatDeliveryDestinations(cities),
                          }))}
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
                <div style={styles.field}><label>Pyyntipäivämäärä</label><input style={{ ...styles.input, ...styles.dateInput }} type="date" min={isMarineCatchForm(form, catchAreaSelector) ? undefined : `${currentCalendarYear - 1}-01-01`} max={today()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
                <div style={styles.field}>
                  <label>Kalastamisalue</label>
                  <select
                    style={styles.input}
                    value={catchAreaSelector}
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      setCatchAreaSelector(nextValue);
                      if (nextValue !== CUSTOM_LAKE_AREA_OPTION && nextValue !== CUSTOM_SEA_AREA_OPTION) {
                        const marineArea = getOfficialMarineArea(nextValue);
                        setForm((prev) => ({
                          ...prev,
                          area: nextValue,
                          waterType: marineArea ? WATER_TYPE_SEA : WATER_TYPE_FRESH,
                          icesSubdivision: marineArea?.icesSubdivision || "",
                          statisticalRectangle: marineArea?.icesSubdivision === prev.icesSubdivision ? prev.statisticalRectangle : "",
                          marineGearCode: marineArea ? (prev.marineGearCode || marineGearTypes[0]?.code || "") : "",
                          vesselLengthClass: marineArea ? (prev.vesselLengthClass || "under_10m") : "",
                          gear: marineArea ? (getMarineGearByCode(prev.marineGearCode)?.name || marineGearTypes[0]?.name || "") : prev.gear,
                        }));
                      } else if (nextValue === CUSTOM_SEA_AREA_OPTION) {
                        setForm((prev) => ({
                          ...prev,
                          area: "",
                          waterType: WATER_TYPE_SEA,
                          icesSubdivision: "",
                          marineGearCode: prev.marineGearCode || marineGearTypes[0]?.code || "",
                          vesselLengthClass: prev.vesselLengthClass || "under_10m",
                          gear: getMarineGearByCode(prev.marineGearCode)?.name || marineGearTypes[0]?.name || "",
                        }));
                      } else {
                        setForm((prev) => ({
                          ...prev,
                          area: "",
                          waterType: WATER_TYPE_FRESH,
                          icesSubdivision: "",
                          statisticalRectangle: "",
                          marineGearCode: "",
                          vesselLengthClass: "",
                        }));
                      }
                    }}
                  >
                    <optgroup label="Sisävedet">
                      {defaultAreas.filter((area) => !legacyMarineAreaNames.has(area)).map((area) => <option key={area} value={area}>{area}</option>)}
                    </optgroup>
                    {savedCustomLakeAreas.length > 0 ? <option disabled value="__custom_lake_separator__">-- Omat järvialueet --</option> : null}
                    {savedCustomLakeAreas.map((area) => <option key={`catch-lake-${area}`} value={area}>{area}</option>)}
                    <optgroup label="Viralliset merialueet">
                      {officialMarineAreas.map((area) => (
                        <option key={`marine-${area.icesSubdivision}`} value={area.name}>
                          {area.name} – ICES {area.icesSubdivision}
                        </option>
                      ))}
                    </optgroup>
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
                      onChange={(e) => setForm((prev) => ({ ...prev, area: e.target.value }))}
                      placeholder={catchAreaSelector === CUSTOM_SEA_AREA_OPTION ? "Esim. Merenkurkku" : "Esim. Puumalan Lietvesi"}
                    />
                  </div>
                ) : null}
                {isMarineCatchForm(form, catchAreaSelector) ? (
                  <>
                    <div style={styles.field}>
                      <label>ICES-osa-alue</label>
                      <select
                        style={styles.input}
                        value={form.icesSubdivision}
                        onChange={(e) => setForm((prev) => ({
                          ...prev,
                          icesSubdivision: e.target.value,
                          statisticalRectangle: e.target.value === prev.icesSubdivision ? prev.statisticalRectangle : "",
                        }))}
                      >
                        <option value="">Valitse</option>
                        {officialMarineAreas.map((area) => (
                          <option key={area.icesSubdivision} value={area.icesSubdivision}>
                            {area.icesSubdivision} – {area.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div style={styles.field}>
                      <label>Tilastoruutu</label>
                      <select
                        style={styles.input}
                        value={form.statisticalRectangle}
                        onChange={(e) => setForm((prev) => ({ ...prev, statisticalRectangle: e.target.value }))}
                        disabled={!form.icesSubdivision}
                      >
                        <option value="">{form.icesSubdivision ? "Valitse tilastoruutu" : "Valitse ensin ICES-osa-alue"}</option>
                        {(marineStatisticalRectanglesBySubdivision[form.icesSubdivision] || []).map((rectangle) => (
                          <option key={rectangle} value={rectangle}>{rectangle}</option>
                        ))}
                      </select>
                    </div>
                  </>
                ) : null}
                {isMarineCatchForm(form, catchAreaSelector) ? (
                  <div style={{ ...styles.field, ...styles.fieldFull, ...styles.noticeInfo }}>
                    Merialueen valinta avaa rannikkokalastusilmoituksen lisätiedot. Sisävesien lomake ja raportti säilyvät ennallaan.
                  </div>
                ) : null}
                <div style={styles.field}>
                  <label>Paikkakunta</label>
                  <MunicipalitySelect value={form.municipality} onChange={(e) => setForm({ ...form, municipality: e.target.value })} />
                </div>
                <div style={styles.field}>
                  <label>Purkamispaikka (pakollinen)</label>
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
                {!isMarineCatchForm(form, catchAreaSelector) ? (
                  <>
                    <div style={styles.field}>
                      <label style={{ ...styles.row, gap: 8, marginTop: 8, fontWeight: 500, color: "#334155" }}>
                        <input
                          type="checkbox"
                          checked={Boolean(form.managementFishing)}
                          onChange={(e) => setForm((prev) => ({ ...prev, managementFishing: e.target.checked }))}
                        />
                        <span>Hoitokalastus</span>
                      </label>
                      <div style={styles.small}>Merkitse tämä erikseen käytetystä pyydyksestä.</div>
                    </div>
                    <div style={styles.field}>
                      <label style={{ ...styles.row, gap: 8, marginTop: 8, fontWeight: 500, color: "#334155" }}>
                        <input
                          type="checkbox"
                          checked={Boolean(form.effortOnly)}
                          onChange={(e) => {
                            const effortOnly = e.target.checked;
                            setForm((prev) => ({
                              ...prev,
                              effortOnly,
                              saleMode: effortOnly ? "none" : prev.saleMode,
                              listForSale: effortOnly ? false : prev.listForSale,
                            }));
                            if (effortOnly) setSpeciesRows([createSpeciesRow()]);
                          }}
                        />
                        <span>Tallenna pyyntiponnistus ilman saalista</span>
                      </label>
                      <div style={styles.small}>Vuoden 2025 ilmoituksessa kalastuspäivän ja pyydyksen tiedot voidaan tallentaa myös ilman saalismäärää.</div>
                    </div>
                  </>
                ) : null}
                <div style={{ ...styles.field, ...styles.fieldFull, ...styles.speciesBox, ...styles.stack }}>
                  <div style={styles.rowBetween}><div><label>KALAERÄ</label></div><button style={styles.button} type="button" onClick={addSpeciesRow}>Lisää laji</button></div>
                  {form.effortOnly ? <div style={styles.noticeInfo}>Saalismäärät jätetään tyhjiksi, koska tallennat vain pyyntiponnistuksen.</div> : null}
                  {speciesRows.map((row, index) => {
                    const isCrayfishRow = isCrayfishSpecies(getSpeciesRowLabel(row));
                    const requiresInlandKgAndCount = !isMarineCatchForm(form, catchAreaSelector) && isInlandDualQuantitySpecies(getSpeciesRowLabel(row));
                    const requiresLandingDeclaration = isMarineCatchForm(form, catchAreaSelector)
                      && (form.vesselLengthClass === "under_10m" || form.vesselLengthClass === "without_vessel")
                      && !isCoastalReportSpeciesAllowed(getSpeciesRowLabel(row));
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
                          <FishSpeciesInput value={row.species} onChange={(e) => updateSpeciesRow(row.id, "species", e.target.value)} disabled={form.effortOnly} />
                          {row.species === "Muu" ? <input style={{ ...styles.input, marginTop: 8 }} placeholder="Kirjoita kalalaji" value={row.customSpecies} onChange={(e) => updateSpeciesRow(row.id, "customSpecies", e.target.value)} /> : null}
                          {requiresLandingDeclaration ? (
                            <div style={{ ...styles.small, color: "#b91c1c", marginTop: 6 }}>
                              Lohi ja turska ilmoitetaan päiväkohtaisella purkamisilmoituksella, ei rannikkokalastusilmoituksella.
                            </div>
                          ) : null}
                        </div>
                        <div style={styles.field}><label>Kg</label><input style={styles.input} type="number" min="0" step={isMarineCatchForm(form, catchAreaSelector) ? "any" : "1"} placeholder="0" value={row.kilos} disabled={form.effortOnly} onChange={(e) => updateSpeciesRow(row.id, "kilos", e.target.value)} /></div>
                        <div style={styles.field}>
                          <label>{`${form.saleMode === "auction" ? "Huutokaupan lähtöhinta" : form.saleMode === "fixed" ? "Kiinteä myyntihinta" : "Hinta"} ALV 0 % (€/${getSpeciesPriceUnit(getSpeciesRowLabel(row))})`}</label>
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
                          <label>{`${form.saleMode === "auction" ? "Huutokaupan lähtöhinta" : form.saleMode === "fixed" ? "Kiinteä myyntihinta" : "Hinta"} sis. ALV ${formatVatPercent()} % (€/${getSpeciesPriceUnit(getSpeciesRowLabel(row))})`}</label>
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
                          <label>{requiresInlandKgAndCount ? "Kpl (pakollinen)" : "Kpl/kg (valinnainen)"}</label>
                          <input style={styles.input} type="number" min="0" step="1" placeholder={isCrayfishRow ? "0" : "Esim. 20"} value={row.count} disabled={form.effortOnly} onChange={(e) => updateSpeciesRow(row.id, "count", e.target.value)} />
                          {!requiresInlandKgAndCount ? <div style={styles.small}>Valinnainen tieto, tärkeä erityisesti pienten kalojen osalta.</div> : <div style={styles.small}>Viranomaisilmoituksessa vaaditaan sekä kilot että kappaleet.</div>}
                        </div>
                        <div style={styles.row}><button style={styles.button} type="button" onClick={() => duplicateSpeciesRow(row.id)}>Kopioi</button><button style={styles.button} type="button" onClick={() => removeSpeciesRow(row.id)}>Poista</button></div>
                      </div>
                    );
                  })}
                </div>
                <div style={styles.field}><label>{isMarineCatchForm(form, catchAreaSelector) ? "Merialueen pyydys" : "Pyydys"}</label><select style={styles.input} value={!isMarineCatchForm(form, catchAreaSelector) && form.inlandGearPresetId ? getInlandGearPresetOptionValue(form.inlandGearPresetId) : form.gear} onChange={(e) => {
                  const selectedValue = e.target.value;
                  const selectedPresetId = getInlandGearPresetIdFromOption(selectedValue);
                  const selectedPreset = selectedPresetId
                    ? savedInlandGearPresets.find((item) => item.id === selectedPresetId) || null
                    : null;
                  const nextGear = selectedPreset?.gearName || selectedValue;
                  const nextMarineGear = marineGearTypes.find((item) => item.name === nextGear) || null;
                  const normalizedNextGear = normalizeCatchGearValue(nextGear);
                  const nextInlandGear = getInlandGearMeta(nextGear);
                  const nextGearDefaults = getStoredGearProfile({ gearProfiles: savedGearProfiles }, nextGear);
                  setForm((prev) => ({
                    ...prev,
                    gear: nextGear,
                    marineGearCode: isMarineCatchForm(prev, catchAreaSelector) ? (nextMarineGear?.code || "") : "",
                    inlandGearCode: isMarineCatchForm(prev, catchAreaSelector) ? "" : (nextInlandGear?.code || ""),
                    inlandGearPresetId: selectedPreset?.id || "",
                    gearCount: nextInlandGear?.fixedCount === 1 ? "1" : (nextGearDefaults.gearCount || ""),
                    fishingDurationDays: nextGearDefaults.fishingDurationDays || "",
                    fishingSecondaryValue: "",
                    netHeight: selectedPreset?.netHeight || (nextInlandGear?.technicalFields.includes("height") || normalizedNextGear === "Verkko" ? nextGearDefaults.netHeight || "" : ""),
                    netMeshSize: selectedPreset?.netMeshSize || (nextInlandGear?.technicalFields.includes("mesh") || normalizedNextGear === "Verkko" ? nextGearDefaults.netMeshSize || "" : ""),
                    gearLength: selectedPreset?.gearLength || "",
                    gearWidth: selectedPreset?.gearWidth || "",
                    otherGearName: selectedPreset?.otherGearName || "",
                    fykeHeight: normalizedNextGear === "Rysä" ? nextGearDefaults.fykeHeight || "" : "",
                  }));
                  setSavedGearCountOptions(nextGearDefaults.gearCountOptions || []);
                  setSavedFishingDurationOptions(nextGearDefaults.fishingDurationOptions || []);
                  setSavedNetHeightOptions(normalizedNextGear === "Verkko" ? nextGearDefaults.netHeightOptions || [] : []);
                  setSavedNetMeshSizeOptions(normalizedNextGear === "Verkko" ? nextGearDefaults.netMeshSizeOptions || [] : []);
                  setSavedFykeHeightOptions(normalizedNextGear === "Rysä" ? nextGearDefaults.fykeHeightOptions || [] : []);
                }}>
                  {isMarineCatchForm(form, catchAreaSelector) ? marineGearTypes.map((item) => (
                    <option key={item.name} value={item.name}>{item.name}</option>
                  )) : (
                    <>
                      {savedInlandGearPresets.length > 0 ? (
                        <optgroup label="Tallennetut pyydykset">
                          {savedInlandGearPresets.map((preset) => (
                            <option key={preset.id} value={getInlandGearPresetOptionValue(preset.id)}>
                              {formatInlandGearPresetLabel(preset)}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                      <optgroup label="Pyydystyypit">
                        {gearTypes.map((gear) => <option key={gear} value={gear}>{gear}</option>)}
                      </optgroup>
                    </>
                  )}
                </select>
                  {!isMarineCatchForm(form, catchAreaSelector) ? (
                    <div style={styles.small}>Tallennetun pyydyksen valinta täyttää sen tekniset tiedot automaattisesti.</div>
                  ) : null}
                  {isMarineCatchForm(form, catchAreaSelector) && form.marineGearCode ? (
                    <div style={styles.small}>Virallinen pyydyskoodi: {form.marineGearCode}</div>
                  ) : form.inlandGearCode ? <div style={styles.small}>Virallinen sisävesipyydyskoodi: {form.inlandGearCode}</div> : null}
                </div>
                <div style={styles.field}>
                  <label>Vesityyppi</label>
                  <select style={styles.input} value={form.waterType} disabled={isMarineCatchForm(form, catchAreaSelector)} onChange={(e) => setForm((prev) => ({ ...prev, waterType: e.target.value }))}>
                    <option value="">Valitse</option>
                    <option value={WATER_TYPE_FRESH}>Makea vesi</option>
                    <option value={WATER_TYPE_SEA}>Meri</option>
                  </select>
                </div>
                {isMarineCatchForm(form, catchAreaSelector) ? (
                  <>
                    <div style={styles.field}>
                      <label>Kalastustapa / aluksen pituus</label>
                      <select
                        style={styles.input}
                        value={form.vesselLengthClass}
                        onChange={(e) => {
                          const vesselLengthClass = e.target.value;
                          setForm((prev) => ({
                            ...prev,
                            vesselLengthClass,
                            fishingWithoutVessel: vesselLengthClass === "without_vessel",
                            selectedVesselId: vesselLengthClass === "without_vessel" ? "" : (prev.selectedVesselId || commercialFishingVesselOptions[0] || ""),
                          }));
                        }}
                      >
                        <option value="">Valitse</option>
                        <option value="under_10m">Alle 10 m alus</option>
                        <option value="at_least_10m">Vähintään 10 m alus</option>
                        <option value="without_vessel">Kalastus ilman alusta</option>
                      </select>
                      {form.vesselLengthClass === "at_least_10m" ? (
                        <div style={styles.small}>Vähintään 10 metrin aluksella käytetään aluskohtaista kalastuspäiväkirjaa, ei rannikkokalastusilmoitusta.</div>
                      ) : null}
                    </div>
                    <div style={{ ...styles.field, ...styles.fieldFull }}>
                      <label>
                        <input
                          type="checkbox"
                          checked={String(form.releasedCatchDetails || "").length > 0}
                          onChange={(e) => setForm((prev) => ({ ...prev, releasedCatchDetails: e.target.checked ? " " : "" }))}
                        />{" "}
                        Vapautettu tai poisheitetty saalis
                      </label>
                      {String(form.releasedCatchDetails || "").length > 0 ? (
                        <textarea
                          style={styles.textarea}
                          value={form.releasedCatchDetails.trimStart()}
                          onChange={(e) => setForm((prev) => ({ ...prev, releasedCatchDetails: e.target.value || " " }))}
                          placeholder="Ilmoita laji, määrä kg ja vapautettiinko vai poisheitettiinkö saalis."
                        />
                      ) : null}
                    </div>
                    <div style={{ ...styles.field, ...styles.fieldFull }}>
                      <label>
                        <input
                          type="checkbox"
                          checked={String(form.incidentalBycatchDetails || "").length > 0}
                          onChange={(e) => setForm((prev) => ({ ...prev, incidentalBycatchDetails: e.target.checked ? " " : "" }))}
                        />{" "}
                        Tahattomat sivusaaliit
                      </label>
                      {String(form.incidentalBycatchDetails || "").length > 0 ? (
                        <textarea
                          style={styles.textarea}
                          value={form.incidentalBycatchDetails.trimStart()}
                          onChange={(e) => setForm((prev) => ({ ...prev, incidentalBycatchDetails: e.target.value || " " }))}
                          placeholder="Ilmoita laji tai eläinryhmä, lukumäärä ja vapautettiinko eläin elävänä."
                        />
                      ) : null}
                    </div>
                    <div style={{ ...styles.field, ...styles.fieldFull }}>
                      <label>
                        <input
                          type="checkbox"
                          checked={String(form.lostGearDetails || "").length > 0}
                          onChange={(e) => setForm((prev) => ({ ...prev, lostGearDetails: e.target.checked ? " " : "" }))}
                        />{" "}
                        Kadonneet tai tuhoutuneet pyydykset
                      </label>
                      {String(form.lostGearDetails || "").length > 0 ? (
                        <textarea
                          style={styles.textarea}
                          value={form.lostGearDetails.trimStart()}
                          onChange={(e) => setForm((prev) => ({ ...prev, lostGearDetails: e.target.value || " " }))}
                          placeholder="Ilmoita pyydystyyppi, määrä ja mitä pyydyksille tapahtui."
                        />
                      ) : null}
                    </div>
                  </>
                ) : null}
                {isMarineCatchForm(form, catchAreaSelector) ? (
                  <>
                    <div style={styles.field}>
                      <label>Pyydysten lkm (pakollinen)</label>
                      <input
                        style={styles.input}
                        type="number"
                        min="1"
                        step="1"
                        value={form.gearCount}
                        onChange={(e) => setForm((prev) => ({ ...prev, gearCount: e.target.value }))}
                        placeholder="Esim. 30"
                      />
                    </div>
                    <div style={styles.field}>
                      <label>Pyyntipäiviä (pakollinen)</label>
                      <input
                        style={styles.input}
                        type="number"
                        min="0"
                        step="any"
                        value={form.fishingDurationDays}
                        onChange={(e) => setForm((prev) => ({ ...prev, fishingDurationDays: e.target.value }))}
                        placeholder="Esim. 2"
                      />
                      <div style={{ ...styles.small, marginTop: 6 }}>Aika päivinä edellisestä kokemiskerrasta.</div>
                    </div>
                    {!isMarineFykeGear(form.marineGearCode) ? (
                      <div style={styles.field}>
                        <label>Kalastusaika tunneissa (valinnainen)</label>
                        <input
                          style={styles.input}
                          type="number"
                          min="0"
                          step="any"
                          value={form.fishingSecondaryValue}
                          onChange={(e) => setForm((prev) => ({ ...prev, fishingSecondaryValue: e.target.value }))}
                          placeholder="Esim. 36"
                        />
                        <div style={{ ...styles.small, marginTop: 6 }}>Keskimääräinen aika edellisestä kokemiskerrasta; ei koske rysäkalastusta.</div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    {catchGearUsesCount(form.gear) ? (
                      <div style={styles.field}>
                        <label>Pyydysten määrä</label>
                        <input
                          style={styles.input}
                          type="number"
                          min="1"
                          step="1"
                          value={currentInlandGearMeta?.fixedCount === 1 ? "1" : form.gearCount}
                          disabled={currentInlandGearMeta?.fixedCount === 1}
                          onChange={(e) => setForm({ ...form, gearCount: e.target.value })}
                          placeholder="Esim. 30"
                        />
                        {currentInlandGearMeta?.fixedCount === 1 ? <div style={styles.small}>Määrä on viranomaisjärjestelmässä aina 1.</div> : null}
                      </div>
                    ) : null}
                    {getFishingDurationFieldMeta(form.gear).splitFields ? (
                      <>
                        <div style={styles.field}>
                          <label>{getFishingDurationFieldMeta(form.gear).durationLabel}</label>
                          <RememberedTextInput
                            value={form.fishingDurationDays}
                            onChange={(e) => setForm((prev) => ({ ...prev, fishingDurationDays: e.target.value }))}
                            options={savedFishingDurationOptions}
                            placeholder={getFishingDurationFieldMeta(form.gear).durationPlaceholder}
                            listId="fishing-duration-options"
                          />
                        </div>
                        <div style={styles.field}>
                          <label>{getFishingDurationFieldMeta(form.gear).speedLabel}</label>
                          <RememberedTextInput
                            value={form.fishingSecondaryValue}
                            onChange={(e) => setForm((prev) => ({ ...prev, fishingSecondaryValue: e.target.value }))}
                            options={[]}
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
                  </>
                )}
                {!isMarineCatchForm(form, catchAreaSelector) && currentInlandTechnicalFields.includes("mesh") ? (
                  <div style={styles.field}>
                    <label>Solmuväli (mm)</label>
                    <input style={styles.input} type="text" inputMode="decimal" value={form.netMeshSize} onChange={(e) => setForm({ ...form, inlandGearPresetId: "", netMeshSize: e.target.value })} placeholder="Esim. 55" />
                  </div>
                ) : null}
                {!isMarineCatchForm(form, catchAreaSelector) && currentInlandTechnicalFields.includes("height") ? (
                  <div style={styles.field}>
                    <label>Korkeus (m)</label>
                    <input style={styles.input} type="text" inputMode="decimal" value={form.netHeight} onChange={(e) => setForm({ ...form, inlandGearPresetId: "", netHeight: e.target.value })} placeholder="Esim. 3,5" />
                  </div>
                ) : null}
                {!isMarineCatchForm(form, catchAreaSelector) && currentInlandTechnicalFields.includes("length") ? (
                  <div style={styles.field}>
                    <label>Pituus (m)</label>
                    <input style={styles.input} type="text" inputMode="decimal" value={form.gearLength} onChange={(e) => setForm({ ...form, inlandGearPresetId: "", gearLength: e.target.value })} placeholder="Esim. 30" />
                    {currentInlandGearMeta?.code === "21" && Number(parseLocaleNumber(form.gearLength) || 0) > 0 && Number(parseLocaleNumber(form.gearCount) || 0) > 0 ? (
                      <div style={styles.small}>Verkkojen kokonaispituus: {Number(parseLocaleNumber(form.gearLength)) * Number(parseLocaleNumber(form.gearCount))} m</div>
                    ) : null}
                  </div>
                ) : null}
                {!isMarineCatchForm(form, catchAreaSelector) && currentInlandTechnicalFields.includes("width") ? (
                  <div style={styles.field}>
                    <label>Leveys (m)</label>
                    <input style={styles.input} type="text" inputMode="decimal" value={form.gearWidth} onChange={(e) => setForm({ ...form, inlandGearPresetId: "", gearWidth: e.target.value })} placeholder="Esim. 30" />
                  </div>
                ) : null}
                {!isMarineCatchForm(form, catchAreaSelector) && currentInlandGearMeta?.requiresOtherName ? (
                  <div style={styles.field}>
                    <label>Muu pyydys, mikä?</label>
                    <input style={styles.input} value={form.otherGearName} onChange={(e) => setForm({ ...form, inlandGearPresetId: "", otherGearName: e.target.value })} placeholder="Kirjoita pyydyksen nimi" />
                  </div>
                ) : null}
                {isMarineCatchForm(form, catchAreaSelector) && normalizeCatchGearValue(form.gear) === "Verkko" ? (
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
                {isMarineCatchForm(form, catchAreaSelector) && normalizeCatchGearValue(form.gear) === "Rysä" ? (
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
                <div style={{ ...styles.field, ...styles.fieldFull, ...styles.stack }}>
                  <label>Myyntitapa</label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
                    {[
                      { value: "none", title: "Ei myyntiin", detail: "Tallenna erä vain saaliskirjanpitoon." },
                      { value: "fixed", title: "Myy kiinteällä hinnalla", detail: "Lähetä erä valituille ostajaryhmille annetulla hinnalla." },
                      { value: "auction", title: "Myy saalis huutokaupassa", detail: "Ostajat kilpailevat erästä huutamalla hintaa ylöspäin." },
                      { value: "consumer", title: "Myy suoraan kuluttajille", detail: "Julkaise erä vain kuluttajamarkkinapaikalle noudettavaksi." },
                    ].map((option) => {
                      const selected = form.saleMode === option.value;
                      const disabled = (form.effortOnly && option.value !== "none") || (fisherPremiumRequired && option.value !== "none") || (option.value === "auction" && !auctionsAvailable);
                      const optionColors = option.value === "none"
                        ? selected
                          ? { background: "linear-gradient(135deg, #64748b, #475569)", border: "#475569", color: "#ffffff", shadow: "rgba(71, 85, 105, 0.25)" }
                          : { background: "#f8fafc", border: "#cbd5e1", color: "#334155", shadow: "transparent" }
                        : option.value === "fixed"
                          ? selected
                            ? { background: "linear-gradient(135deg, #059669, #16a34a)", border: "#047857", color: "#ffffff", shadow: "rgba(5, 150, 105, 0.25)" }
                            : { background: "#f0fdf4", border: "#86efac", color: "#166534", shadow: "transparent" }
                          : option.value === "consumer"
                            ? selected
                              ? { background: "linear-gradient(135deg, #0f766e, #0891b2)", border: "#0f766e", color: "#ffffff", shadow: "rgba(15, 118, 110, 0.25)" }
                              : { background: "#ecfeff", border: "#67e8f9", color: "#155e75", shadow: "transparent" }
                          : selected
                            ? { background: "linear-gradient(135deg, #7c3aed, #4f46e5)", border: "#6d28d9", color: "#ffffff", shadow: "rgba(109, 40, 217, 0.25)" }
                            : { background: "#f5f3ff", border: "#c4b5fd", color: "#5b21b6", shadow: "transparent" };
                      return (
                        <button
                          key={option.value}
                          type="button"
                          disabled={disabled}
                          style={{
                            ...styles.button,
                            width: "100%",
                            minHeight: 104,
                            padding: 16,
                            textAlign: "left",
                            justifyContent: "flex-start",
                            alignItems: "stretch",
                            opacity: disabled ? 0.5 : selected ? 1 : 0.92,
                            background: optionColors.background,
                            borderColor: optionColors.border,
                            color: optionColors.color,
                            boxShadow: selected ? `0 0 0 2px ${optionColors.border}33, 0 10px 22px ${optionColors.shadow}` : "none",
                            transform: selected ? "translateY(-1px)" : "none",
                            transition: "transform 160ms ease, box-shadow 160ms ease, background 160ms ease, opacity 160ms ease",
                          }}
                          onClick={() => setForm((prev) => ({
                            ...prev,
                            saleMode: option.value,
                            listForSale: option.value !== "none",
                            ...(option.value === "fixed" ? {} : { offerToShops: false, offerToRestaurants: false, offerToWholesalers: false }),
                            ...(option.value === "consumer" ? { deliveryPossible: false, deliveryMethod: "Nouto", deliveryArea: savedPickupAddress, deliveryDestinations: [] } : {}),
                            ...(option.value !== "none" ? {} : { deliveryPossible: false }),
                          }))}
                        >
                          <span style={{ display: "flex", width: "100%", flexDirection: "column", alignItems: "flex-start", gap: 7 }}>
                            <span style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                              <strong style={{ fontSize: 17 }}>{option.title}</strong>
                              {selected ? <span style={{ padding: "4px 8px", borderRadius: 999, background: "rgba(255,255,255,0.2)", fontSize: 11, fontWeight: 900, whiteSpace: "nowrap" }}>✓ Valittu</span> : null}
                            </span>
                            <span style={{ ...styles.small, color: optionColors.color, opacity: 0.88 }}>{option.detail}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
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
                {form.saleMode !== "consumer" ? <div style={{ ...styles.field, ...styles.fieldFull }}>
                  <label>Pakkaustapa</label>
                  <select
                    style={styles.input}
                    value={form.packaging}
                    onChange={(e) => setForm((prev) => ({ ...prev, packaging: e.target.value }))}
                  >
                    <option value="">Valitse, miten kalaerä on pakattu</option>
                    {FISH_PACKAGING_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                  <div style={styles.small}>Pakkaustapa näkyy yritysostajalle sekä kiinteähintaisessa tarjouksessa että huutokaupassa.</div>
                </div> : null}
                {form.saleMode === "consumer" ? (
                  <div style={{ ...styles.field, ...styles.fieldFull, ...styles.offerBox, ...styles.stack, background: "#ecfeff", borderColor: "#67e8f9" }}>
                    <div><strong>Suoraan kuluttajille</strong><div style={styles.small}>Tämä erä julkaistaan vain kuluttajamarkkinapaikalle. Yritysostajille ei lähetetä tarjousta eikä erää avata huutokauppaan.</div></div>
                    <div style={styles.field}>
                      <label>Myyntiyksikkö</label>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
                        {[
                          { value: "package", title: "Valmiit pakkaukset", detail: "Esimerkiksi 0,5 kg, 1 kg ja 2 kg pakkaukset." },
                          { value: "whole_fish", title: "Kokonaiset kalat", detail: "Kuluttaja varaa kalat kappaleittain valitsemastaan kokoluokasta." },
                        ].map((option) => {
                          const selected = form.consumerSaleUnitType === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              style={{ ...styles.button, minHeight: 88, textAlign: "left", justifyContent: "flex-start", background: selected ? "#0f766e" : "#fff", color: selected ? "#fff" : "#134e4a", borderColor: selected ? "#0f766e" : "#99f6e4" }}
                              onClick={() => setForm((prev) => ({ ...prev, consumerSaleUnitType: option.value, consumerVariants: [createConsumerSaleVariant(option.value)] }))}
                            >
                              <span><strong>{selected ? "✓ " : ""}{option.title}</strong><span style={{ display: "block", marginTop: 5, fontSize: 13, opacity: 0.86 }}>{option.detail}</span></span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
                      <div style={{ ...styles.field, gridColumn: "1 / -1" }}><label>Tuotteen nimi</label><input style={styles.input} value={form.consumerProductName} onChange={(event) => setForm((prev) => ({ ...prev, consumerProductName: event.target.value, consumerProductNameAutoFilled: false }))} placeholder={formatSpeciesForSale(getSpeciesRowLabel(speciesRows[0])) || "Esim. Tuore kokonainen kuha"} /><div style={styles.small}>Nimi täytetään automaattisesti kalalajista, mutta voit muokata sitä kuluttajalle kuvaavammaksi.</div></div>
                      {(form.consumerVariants || []).map((variant, variantIndex) => (
                        <div key={variant.id} style={{ ...styles.field, gridColumn: "1 / -1", border: "1px solid #99f6e4", borderRadius: 14, padding: 12, background: "rgba(255,255,255,0.75)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 10 }}>
                            <strong>{form.consumerSaleUnitType === "whole_fish" ? `Kokoluokka ${variantIndex + 1}` : `Pakkauskoko ${variantIndex + 1}`}</strong>
                            {(form.consumerVariants || []).length > 1 ? <button type="button" onClick={() => setForm((prev) => ({ ...prev, consumerVariants: prev.consumerVariants.filter((item) => item.id !== variant.id) }))}>Poista</button> : null}
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
                            <div style={styles.field}>
                              <label>{form.consumerSaleUnitType === "whole_fish" ? "Kokoluokan nimi" : "Pakkauksen nimi"}</label>
                              <input style={styles.input} value={variant.label} onChange={(event) => setForm((prev) => ({ ...prev, consumerVariants: prev.consumerVariants.map((item) => item.id === variant.id ? { ...item, label: event.target.value } : item) }))} placeholder={form.consumerSaleUnitType === "whole_fish" ? "Esim. Kuha 1,2–1,8 kg" : "Esim. 1 kg pakkaus"} />
                            </div>
                            {form.consumerSaleUnitType === "package" ? (
                              <>
                                <div style={styles.field}><label>Pakkauksen koko kg</label><input style={styles.input} inputMode="decimal" value={variant.packageSizeKg} onChange={(event) => setForm((prev) => ({ ...prev, consumerVariants: prev.consumerVariants.map((item) => item.id === variant.id ? { ...item, packageSizeKg: event.target.value } : item) }))} placeholder="1,0" /></div>
                                <div style={styles.field}><label>Hinta / pakkaus sis. ALV (€)</label><input style={styles.input} inputMode="decimal" value={variant.unitPrice} onChange={(event) => setForm((prev) => ({ ...prev, consumerVariants: prev.consumerVariants.map((item) => item.id === variant.id ? { ...item, unitPrice: event.target.value, priceAutoFilled: false } : item) }))} placeholder="12,90" /></div>
                              </>
                            ) : (
                              <>
                                <div style={styles.field}><label>Pienin paino kg / kala</label><input style={styles.input} inputMode="decimal" value={variant.minWeightKg} onChange={(event) => setForm((prev) => ({ ...prev, consumerVariants: prev.consumerVariants.map((item) => item.id === variant.id ? { ...item, minWeightKg: event.target.value } : item) }))} placeholder="0,8" /></div>
                                <div style={styles.field}><label>Suurin paino kg / kala</label><input style={styles.input} inputMode="decimal" value={variant.maxWeightKg} onChange={(event) => setForm((prev) => ({ ...prev, consumerVariants: prev.consumerVariants.map((item) => item.id === variant.id ? { ...item, maxWeightKg: event.target.value } : item) }))} placeholder="1,2" /></div>
                                <div style={styles.field}><label>Kilohinta sis. ALV (€ / kg)</label><input style={styles.input} inputMode="decimal" value={variant.pricePerKg} onChange={(event) => setForm((prev) => ({ ...prev, consumerVariants: prev.consumerVariants.map((item) => item.id === variant.id ? { ...item, pricePerKg: event.target.value, priceAutoFilled: false } : item) }))} placeholder="16,90" /></div>
                              </>
                            )}
                            <div style={styles.field}><label>{form.consumerSaleUnitType === "whole_fish" ? "Kaloja myyntiin (kpl)" : "Pakkauksia myyntiin (kpl)"}</label><input style={styles.input} type="number" min="1" step="1" value={variant.availableUnits} onChange={(event) => setForm((prev) => ({ ...prev, consumerVariants: prev.consumerVariants.map((item) => item.id === variant.id ? { ...item, availableUnits: event.target.value } : item) }))} /></div>
                          </div>
                        </div>
                      ))}
                      <button type="button" style={{ ...styles.button, gridColumn: "1 / -1", justifySelf: "start" }} onClick={() => setForm((prev) => ({ ...prev, consumerVariants: [...(prev.consumerVariants || []), createConsumerSaleVariant(prev.consumerSaleUnitType)] }))}>+ Lisää {form.consumerSaleUnitType === "whole_fish" ? "kokoluokka" : "pakkauskoko"}</button>
                      <div style={{ ...styles.field, gridColumn: "1 / -1" }}><label>Nouto-osoite tai tarkka noutopaikka</label><input style={styles.input} value={form.consumerPickupLocation || savedPickupAddress} onChange={(event) => setForm((prev) => ({ ...prev, consumerPickupLocation: event.target.value }))} placeholder="Esim. Puumalan satama, Satamatie 2" /></div>
                      <div style={styles.field}><label>Noutopäivä</label><input style={{ ...styles.input, ...styles.dateInput }} type="date" value={form.consumerPickupDate} onChange={(event) => setForm((prev) => ({ ...prev, consumerPickupDate: event.target.value }))} /></div>
                      <div style={styles.field}><label>Noudettavissa alkaen</label><input style={styles.input} type="time" value={form.consumerPickupStartTime} onChange={(event) => setForm((prev) => ({ ...prev, consumerPickupStartTime: event.target.value }))} /></div>
                      <div style={styles.field}><label>Noudettavissa asti</label><input style={styles.input} type="time" value={form.consumerPickupEndTime} onChange={(event) => setForm((prev) => ({ ...prev, consumerPickupEndTime: event.target.value }))} /></div>
                      <div style={styles.field}><label>Tilaukset viimeistään (tuntia ennen noutoa)</label><input style={styles.input} type="number" min="0" step="0.5" value={form.consumerOrderDeadlineHours} onChange={(event) => setForm((prev) => ({ ...prev, consumerOrderDeadlineHours: event.target.value }))} placeholder="2" /><div style={styles.small}>Esimerkiksi 2 sulkee tilaamisen kaksi tuntia ennen noutoajan alkua.</div></div>
                      <div style={{ ...styles.field, gridColumn: "1 / -1" }}><label>Kuluttajalle näkyvä kuvaus</label><textarea style={styles.textarea} value={form.consumerDescription} onChange={(event) => setForm((prev) => ({ ...prev, consumerDescription: event.target.value }))} placeholder="Kerro käsittelystä, tuoreudesta ja noudosta." /></div>
                    </div>
                    <div style={styles.small}>{form.consumerSaleUnitType === "whole_fish" ? "Kuluttaja varaa kappalemäärän. Sovellus näyttää paino- ja hinta-arvion, ja lopullinen hinta lasketaan punnitusta painosta noudon yhteydessä." : "Kuluttaja voi valita pakkauskoon ja useita pakkauksia, esimerkiksi 1 kg + 1 kg + 0,5 kg erillisinä varauksina."}</div>
                    <div style={styles.noticeInfo}>Kuluttaja maksaa suoraan kalastajalle noudon yhteydessä. Palvelu kirjaa toteutuneesta kaupasta 3 % komission verottomasta myyntiarvosta.</div>
                  </div>
                ) : null}
                {form.saleMode === "auction" ? (
                  <div style={{ ...styles.field, ...styles.fieldFull, ...styles.offerBox, ...styles.stack }}>
                    <strong>Huutokaupan asetukset</strong>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
                      {speciesRows.map((row, index) => {
                        const speciesLabel = getSpeciesRowLabel(row) || `Kalaerä ${index + 1}`;
                        const priceUnit = getSpeciesPriceUnit(speciesLabel);
                        return (
                          <div key={`auction-start-${row.id}`} style={styles.field}>
                            <label>{`${speciesRows.length > 1 ? `Lähtöhinta – ${speciesLabel}` : "Lähtöhinta"} ALV 0 % (€/${priceUnit})`}</label>
                            <input
                              style={styles.input}
                              type="text"
                              inputMode="decimal"
                              value={row.price_per_kg}
                              onChange={(e) => updateSpeciesRow(row.id, "price_per_kg", e.target.value)}
                              placeholder="Esim. 4,00"
                            />
                            <div style={styles.small}>Sama lähtöhinta kuin kalaerän hintakentässä. Voit vielä muuttaa sitä tässä ennen huutokaupan aloittamista.</div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
                      <div style={styles.field}><label>Kesto</label><select style={styles.input} value={form.auctionDurationMinutes} onChange={(e) => setForm((prev) => ({ ...prev, auctionDurationMinutes: Number(e.target.value) }))}>{AUCTION_DURATION_OPTIONS.map((option) => <option key={option.minutes} value={option.minutes}>{option.label}</option>)}</select></div>
                      <div style={styles.field}>
                        <label>Minimikorotus €/{auctionContainsOnlyCrayfish ? "kpl" : "kg"}</label>
                        <input
                          style={styles.input}
                          inputMode="decimal"
                          value={auctionContainsOnlyCrayfish ? "0,05" : form.auctionMinimumIncrement}
                          disabled={auctionContainsOnlyCrayfish}
                          onChange={(e) => setForm((prev) => ({ ...prev, auctionMinimumIncrement: e.target.value }))}
                          placeholder={auctionContainsOnlyCrayfish ? "0,05" : "Esim. 0,20"}
                        />
                        {auctionContainsOnlyCrayfish ? <div style={styles.small}>Rapuhuutokaupan minimikorotus on 0,05 €/kpl.</div> : speciesRows.some((row) => isCrayfishSpecies(getSpeciesRowLabel(row))) ? <div style={styles.small}>Rapuerille käytetään automaattisesti minimikorotusta 0,05 €/kpl.</div> : null}
                      </div>
                      <div style={styles.field}><label>Pohjahinta €/kg (valinnainen)</label><input style={styles.input} inputMode="decimal" value={form.auctionReservePrice} onChange={(e) => setForm((prev) => ({ ...prev, auctionReservePrice: e.target.value }))} placeholder="Esim. 6,00" /></div>
                    </div>
                    <div style={styles.noticeInfo}>
                      <strong>Mitä pohjahinta tarkoittaa?</strong><br />
                      Pohjahinta on alin hinta, jolla suostut myymään erän. Ostajat eivät näe sen euromäärää. Jos korkein huuto jää pohjahinnan alle, erää ei myydä. Jätä kenttä tyhjäksi, jos korkein hyväksytty huuto saa voittaa lähtöhinnasta alkaen.
                    </div>
                    <div style={styles.small}>Viimeisten 3 minuutin aikana tehty hyväksytty huuto siirtää päättymisen aina 3 minuutin päähän viimeisestä huudosta.</div>
                  </div>
                ) : null}
                {form.saleMode !== "consumer" ? <div style={styles.field}><label>Aikaisin toimitus</label><input style={{ ...styles.input, ...styles.dateInput }} type="date" value={form.earliestDeliveryDate} onChange={(e) => setForm({ ...form, earliestDeliveryDate: e.target.value })} /></div> : null}
                {form.saleMode !== "consumer" ? <div style={styles.field}><label><input type="checkbox" checked={form.coldTransport} onChange={(e) => setForm({ ...form, coldTransport: e.target.checked })} /> Kylmäkuljetus</label></div> : null}
                {form.saleMode === "fixed" ? <div style={{ ...styles.field, ...styles.fieldFull }}>
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
                </div> : null}
                {form.saleMode !== "consumer" ? (DELIVERY_COMPETITION_AVAILABLE && form.deliveryPossible ? (
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
                    <div style={styles.field}><label>Toimitustapa</label><select style={styles.input} value={normalizeFishermanDeliveryMethod(form.deliveryMethod)} onChange={(e) => {
                      const nextMethod = e.target.value;
                      setForm((prev) => ({
                        ...prev,
                        deliveryMethod: nextMethod,
                        deliveryArea: nextMethod === "Nouto"
                          ? savedPickupAddress
                          : formatDeliveryDestinations(prev.deliveryDestinations),
                      }));
                    }}>{fishermanDeliveryMethods.map((method) => <option key={method} value={method}>{method}</option>)}</select></div>
                    <div style={styles.field}>
                      <label>{normalizeFishermanDeliveryMethod(form.deliveryMethod) === "Nouto" ? "Nouto-osoite" : "Toimitusalue"}</label>
                      {normalizeFishermanDeliveryMethod(form.deliveryMethod) === "Nouto" ? (
                        <input
                          style={styles.input}
                          placeholder="Esim. Satamakatu 1, Kuopio"
                          value={resolveOfferDeliveryArea(normalizeFishermanDeliveryMethod(form.deliveryMethod), form.deliveryArea, form.deliveryDestinations, savedPickupAddress)}
                          onChange={(e) => setForm({ ...form, deliveryArea: e.target.value })}
                        />
                      ) : (
                        <MultiCityInput
                          value={form.deliveryDestinations}
                          onChange={(cities) => setForm((prev) => ({
                            ...prev,
                            deliveryDestinations: normalizeDestinationCities(cities),
                            deliveryArea: formatDeliveryDestinations(cities),
                          }))}
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
                )) : null}
                {form.saleMode === "fixed" ? (
                <div style={{ ...styles.field, ...styles.fieldFull }}>
                  <div style={{ ...styles.offerBox, ...styles.stack }}>
                    <div>
                      <label>Tarjoa erää myyntiin</label>
                      <div style={styles.small}>Valitse, lähetetäänkö kalaerä ostajaryhmille vai vain nimetyille sopimusostajille.</div>
                    </div>
                    <div style={styles.checkboxRow}>
                      <label style={styles.checkboxCard}>
                        <input type="radio" name="offerAudience" checked={form.offerAudience !== "selected"} onChange={() => setForm((prev) => ({ ...prev, offerAudience: "groups", selectedBuyerIds: [] }))} />
                        Ostajaryhmille
                      </label>
                      <label style={styles.checkboxCard}>
                        <input type="radio" name="offerAudience" checked={form.offerAudience === "selected"} onChange={() => setForm((prev) => ({ ...prev, offerAudience: "selected", offerToShops: false, offerToRestaurants: false, offerToWholesalers: false }))} />
                        Vain tietyille ostajille
                      </label>
                    </div>
                    {form.offerAudience === "selected" ? (
                      <div style={{ ...styles.stack, gap: 8 }}>
                        <strong>Valitse tarjouksen vastaanottajat</strong>
                        <div style={styles.small}>Erä ja tarjous näkyvät vain valituille ostajille. Voit valita yhden tai useamman sopimusostajan.</div>
                        {(buyers || []).filter((buyer) => buyer.is_active).length === 0 ? (
                          <div style={styles.noticeInfo}>Aktiivisia ostajia ei löytynyt. Pyydä ylläpitäjää lisäämään sopimusostaja ensin.</div>
                        ) : (
                          <div style={{ ...styles.stack, gap: 10 }}>
                            <select
                              style={styles.input}
                              value=""
                              onChange={(event) => {
                                const buyerId = event.target.value;
                                if (!buyerId) return;
                                setForm((prev) => ({
                                  ...prev,
                                  selectedBuyerIds: Array.from(new Set([...prev.selectedBuyerIds, buyerId])),
                                }));
                              }}
                            >
                              <option value="">Valitse ostaja pudotusvalikosta</option>
                              {(buyers || [])
                                .filter((buyer) => buyer.is_active && !form.selectedBuyerIds.includes(String(buyer.id)))
                                .map((buyer) => (
                                  <option key={buyer.id} value={String(buyer.id)}>
                                    {buyer.company_name || "Nimetön ostajayritys"}
                                  </option>
                                ))}
                            </select>
                            {form.selectedBuyerIds.length > 0 ? (
                              <div style={{ ...styles.stack, gap: 8 }}>
                                {form.selectedBuyerIds.map((buyerId) => {
                                  const buyer = (buyers || []).find((item) => String(item.id) === buyerId);
                                  if (!buyer) return null;
                                  return (
                                    <div key={buyerId} style={{ ...styles.checkboxCard, justifyContent: "space-between" }}>
                                      <span>
                                        <strong>{buyer.company_name || "Nimetön ostajayritys"}</strong>
                                      </span>
                                      <button
                                        type="button"
                                        style={styles.button}
                                        onClick={() => setForm((prev) => ({
                                          ...prev,
                                          selectedBuyerIds: prev.selectedBuyerIds.filter((id) => id !== buyerId),
                                        }))}
                                      >
                                        Poista
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>
                        )}
                        {form.selectedBuyerIds.length > 0 ? <div style={styles.noticeSuccess}>{form.selectedBuyerIds.length} ostajaa valittu.</div> : null}
                      </div>
                    ) : (
                      <div style={styles.checkboxRow}>
                        <label style={styles.checkboxCard}><input type="checkbox" checked={form.offerToShops} onChange={(e) => setForm({ ...form, offerToShops: e.target.checked })} /> Kauppoihin</label>
                        <label style={styles.checkboxCard}><input type="checkbox" checked={form.offerToRestaurants} onChange={(e) => setForm({ ...form, offerToRestaurants: e.target.checked })} /> Ravintoloihin</label>
                        <label style={styles.checkboxCard}><input type="checkbox" checked={form.offerToWholesalers} onChange={(e) => setForm({ ...form, offerToWholesalers: e.target.checked })} /> Tukkuihin</label>
                      </div>
                    )}
                  </div>
                </div>
                ) : null}
                  </>
                ) : null}
                <div style={{ ...styles.field, ...styles.fieldFull }}><label>Lisätiedot</label><textarea style={styles.textarea} placeholder="Esim. laatu, jäähdytys, toimitus, huomioita" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                {form.saleMode === "auction" ? (
                  <div style={{ ...styles.field, ...styles.fieldFull }}>
                    <div style={{ ...styles.offerBox, ...styles.stack, background: "#eff6ff", borderColor: "#93c5fd" }}>
                      <div>
                        <label>Huutokaupan kuva (valinnainen)</label>
                        <div style={styles.small}>Kuva näkyy ostajille huutokaupan yhteydessä. JPG-, PNG- ja WebP-kuvat pienennetään tarvittaessa automaattisesti.</div>
                      </div>
                      <div style={{ ...styles.row, alignItems: "center", flexWrap: "wrap" }}>
                        <label style={{ ...styles.button, display: "inline-flex", alignItems: "center", cursor: "pointer" }}>
                          {auctionImageFile ? "Vaihda kuva" : "Valitse kuva"}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            style={{ display: "none" }}
                            onChange={handleAuctionImageSelection}
                          />
                        </label>
                        <label style={{ ...styles.button, display: "inline-flex", alignItems: "center", cursor: "pointer", background: "#ecfdf5", borderColor: "#86efac", color: "#166534" }}>
                          Ota kuva
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            style={{ display: "none" }}
                            onChange={handleAuctionImageSelection}
                          />
                        </label>
                        {auctionImageFile ? <span style={{ ...styles.small, overflowWrap: "anywhere" }}>{auctionImageFile.name}</span> : null}
                        {auctionImageFile ? (
                          <button type="button" style={styles.button} onClick={() => { setAuctionImageFile(null); setAuctionImagePreviewUrl(""); }}>Poista kuva</button>
                        ) : null}
                      </div>
                      {auctionImagePreviewUrl ? (
                        <img src={auctionImagePreviewUrl} alt="Huutokauppakuvan esikatselu" style={{ display: "block", width: "100%", maxWidth: 520, maxHeight: 320, objectFit: "cover", borderRadius: 12, border: "1px solid #bfdbfe" }} />
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
              <div style={{ ...styles.row, justifyContent: "flex-end" }}><button style={{ ...styles.button, ...styles.primaryButton }} onClick={handleSave} disabled={saving}>{saving ? "Tallennetaan..." : isCatchAuction ? "Tallenna saalis ja aloita huutokauppa" : isConsumerSale ? "Tallenna ja julkaise kuluttajille" : shouldSendOffer ? "Tallenna saalis ja lähetä tarjous" : "Tallenna saalis"}</button></div>
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
              {salesSelectionMode ? (
                <div id="catch-entry-sales" style={{ ...styles.noticeInfo, borderColor: "#86efac", background: "#f0fdf4", color: "#166534" }}>
                  <strong>Valitse myytävä saaliserä.</strong>{" "}
                  Paina haluamasi, vielä myymättömän erän kohdalta “Laita erä myyntiin”. Jos saalista ei ole vielä kirjattu, siirry ensin Lisää saalis -näkymään.
                </div>
              ) : null}
              <div style={styles.rowBetween}><strong>{profile.role === "owner" && entryScope === "all" ? "Kaikkien saaliit" : "Omat saaliit"}</strong><input style={{ ...styles.input, maxWidth: 360 }} placeholder="Hae lajilla, paikalla, pyydyksellä..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
              {groupedFilteredEntries.length === 0 ? <div style={styles.muted}>Ei hakutuloksia.</div> : groupedFilteredEntries.map((group) => (
                <div key={group.key} style={{ ...styles.stack, gap: 12 }}>
                  <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack, background: "#f8fbff" }}>
                    <div style={styles.rowBetween}>
                      <strong style={{ textTransform: "capitalize" }}>{group.label}</strong>
                      <div style={styles.entryBadges}>
                        <span style={styles.badge}>{group.entries.length} erää</span>
                        {group.totalKilos > 0 ? <span style={styles.badge}>{group.totalKilos.toFixed(1)} kg yhteensä</span> : null}
                        {group.totalPieces > 0 ? <span style={styles.badge}>{group.totalPieces.toLocaleString("fi-FI")} kpl rapuja yhteensä</span> : null}
                        {group.forSaleKilos > 0 ? <span style={styles.badge}>{group.forSaleKilos.toFixed(1)} kg myynnissä</span> : null}
                        {group.forSalePieces > 0 ? <span style={styles.badge}>{group.forSalePieces.toLocaleString("fi-FI")} kpl rapuja myynnissä</span> : null}
                      </div>
                    </div>
                    {group.speciesSummary.length > 0 ? (
                      <div style={{ ...styles.stack, gap: 8 }}>
                        <div style={styles.muted}><strong>Kalalajit kuukaudelta</strong></div>
                        {group.speciesSummary.map((item) => (
                          <div key={item.species} style={styles.rowBetween}>
                            <span>{item.species}</span>
                            <span>{item.unit === "kpl" ? item.quantity.toLocaleString("fi-FI") : item.quantity.toFixed(1)} {item.unit}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {group.entries.map((entry) => (
                    <div key={entry.id} id={`catch-entry-${entry.batchId || entry.id}`} style={styles.entry}>
                      <div style={styles.entryHeader}>
                        <div>
                          <div style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", lineHeight: 1.1, marginBottom: 6 }}>
                            {formatSpeciesForSale(entry.species)}
                          </div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: "#1d4ed8", marginBottom: 10 }}>
                            Pyyntipäivä: {entry.date || "-"}
                          </div>
                          <div style={styles.entryBadges}>
                            <span style={styles.badge}>{formatCatchEntryQuantity(entry)}</span>
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
                          {getEntryConsumerListing(entry) ? (
                            <div style={{ ...styles.noticeInfo, marginTop: 10, display: "grid", gap: 7 }}>
                              <div><strong>Suoraan kuluttajille</strong> · {getEntryConsumerListing(entry).status === "published" ? "Myynnissä" : getEntryConsumerListing(entry).status === "sold_out" ? "Loppuunmyyty" : getEntryConsumerListing(entry).status}</div>
                              <div style={{ ...styles.small, overflowWrap: "anywhere" }}>{getConsumerListingUrl(getEntryConsumerListing(entry).id, getPublicAppBaseUrl())}</div>
                              <div style={styles.row}>
                                <button type="button" style={{ ...styles.button, fontWeight: 800 }} onClick={() => openConsumerListingLink(getEntryConsumerListing(entry))}>Avaa myynti-ilmoitus</button>
                                <button type="button" style={styles.button} onClick={() => copyConsumerListingLink(getEntryConsumerListing(entry))}>Kopioi linkki</button>
                              </div>
                            </div>
                          ) : null}
                          {isEntryOfferedForSale(entry) ? (
                            <div style={styles.muted}>Toimitus: {entry.deliveryMethod || "-"} · {entry.deliveryArea || "-"} · Kulu {entry.deliveryCost !== "" && entry.deliveryCost != null ? `${entry.deliveryCost} €` : "-"} · Aikaisin {entry.earliestDeliveryDate || "-"} · Kylmäkuljetus {entry.coldTransport ? "kyllä" : "ei"}</div>
                          ) : null}
                          {entry.commercialFishingId ? <div style={styles.muted}>Kaupallisen kalastajan tunnus: {entry.commercialFishingId}</div> : null}
                        </div>
                        <div style={styles.row}>
                          {!isEntryOfferedForSale(entry) && !getEntryConsumerListing(entry) && String(entry.ownerUserId || profile.id) === String(profile.id) ? (
                            <button
                              style={{
                                ...styles.button,
                                background: "linear-gradient(135deg, #059669, #16a34a)",
                                borderColor: "#047857",
                                color: "#ffffff",
                                fontWeight: 800,
                                boxShadow: "0 8px 18px rgba(5, 150, 105, 0.2)",
                              }}
                              onClick={() => openCatchSaleDialog(entry)}
                            >
                              Laita erä myyntiin
                            </button>
                          ) : null}
                          {canPrintCatchLabels(entry) ? (
                            <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => { setLabelPrintEntry(entry); setLabelPrintCount(isThermalCatchLabelFormat(labelPrintFormat) ? 1 : 10); setLabelPrintPieceCount(""); setLabelPrintWeightKg(""); setLabelPrintProductForm(getCatchLabelProductForm(entry.species)); setLabelPrintUseByDate(""); }}>
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
          <div style={styles.stack}>
          {profile.role === "member" ? <ConsumerSellerPanel profile={profile} /> : null}
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
            requestedOfferId={pendingOfferTarget?.offerId || focusedFixedOfferId || requestedOfferId}
            buyerTypeLabel={buyerTypeLabel}
            buyerStatusLabel={buyerStatusLabel}
            shouldRevealBuyerIdentity={shouldRevealBuyerIdentity}
            onCreateDeliveryNote={handleCreateDeliveryNote}
          />
          </div>
        ) : null}

        {activeTab === "auctions" && auctionsAvailable && ["member", "owner"].includes(profile.role) ? (
          <AuctionsView profile={profile} buyerRecord={linkedBuyerRecord} entries={entries} notificationTarget={pendingAuctionTarget} onNotificationTargetHandled={handleAuctionTargetHandled} onTradeCreated={() => setRefreshTick((previous) => previous + 1)} onCreateDeliveryNote={handleCreateAuctionDeliveryNote} onOpenAccountDetails={openAccountDetails} createRequestKey={auctionCreateRequestKey} />
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
              <div style={styles.field}><label><input type="checkbox" checked={buyerForm.auction_email_enabled !== false} onChange={(e) => setBuyerForm((prev) => ({ ...prev, auction_email_enabled: e.target.checked }))} /> Huutokauppailmoitukset sähköpostiin</label></div>
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
                                      <span style={{ ...styles.badge, background: isFisherPremiumProfile(linkedProfile) ? "#ecfdf5" : "#fff7ed", borderColor: isFisherPremiumProfile(linkedProfile) ? "#86efac" : "#fdba74", color: isFisherPremiumProfile(linkedProfile) ? "#166534" : "#9a3412" }}>
                                        {Date.parse(linkedProfile?.fisher_premium_pilot_expires_at || "") > Date.now()
                                          ? "Premium · pilotti 31.12.2026 asti"
                                          : isFisherPremiumProfile(linkedProfile) ? "Premium" : "Ilmainen"}
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
                                      style={linkedProfile?.fisher_premium_admin_enabled ? styles.button : { ...styles.button, ...styles.primaryButton }}
                                      onClick={() => toggleFisherPremium(user, linkedProfile)}
                                    >
                                      {linkedProfile?.fisher_premium_admin_enabled ? "Poista admin-oikeus" : "Aktivoi admin-oikeus"}
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

        {catchSaleEntry ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 2600,
              padding: 16,
              background: "rgba(15, 23, 42, 0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onClick={closeCatchSaleDialog}
          >
            <div
              style={{
                ...styles.card,
                ...styles.sectionCard,
                width: "min(820px, calc(100vw - 32px))",
                maxHeight: "calc(100dvh - 32px)",
                overflowY: "auto",
                boxSizing: "border-box",
                background: "#ffffff",
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <div style={styles.rowBetween}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>Laita kalaerä myyntiin</div>
                  <div style={styles.muted}>
                    {formatSpeciesForSale(catchSaleEntry.species)} · {formatCatchEntryQuantity(catchSaleEntry)} · {catchSaleEntry.batchId || "Erätunnus puuttuu"}
                  </div>
                </div>
                <button style={styles.button} type="button" onClick={closeCatchSaleDialog} disabled={catchSaleSaving}>Sulje</button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))", gap: 14, marginTop: 18 }}>
                <div style={styles.field}>
                  <label>Pakkaustapa</label>
                  <select style={styles.input} value={catchSaleDraft.packaging} onChange={(event) => setCatchSaleDraft((current) => ({ ...current, packaging: event.target.value }))}>
                    <option value="">Valitse pakkaustapa</option>
                    {FISH_PACKAGING_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>
                <div style={styles.field}>
                  <label>Myyntihinta ALV 0 % (€/{getSpeciesPriceUnit(catchSaleEntry.species)})</label>
                  <input
                    style={styles.input}
                    type="text"
                    inputMode="decimal"
                    value={catchSaleDraft.pricePerKg}
                    onChange={(event) => setCatchSaleDraft((current) => ({ ...current, pricePerKg: event.target.value }))}
                    placeholder="Esim. 8,50"
                  />
                </div>
              </div>

              <div style={{ ...styles.offerBox, ...styles.stack, marginTop: 16 }}>
                <div>
                  <strong>Tarjouksen vastaanottajat</strong>
                  <div style={styles.small}>Valitse ostajaryhmät tai lähetä tarjous vain nimetyille ostajille.</div>
                </div>
                <div style={styles.checkboxRow}>
                  <label style={styles.checkboxCard}>
                    <input type="radio" name="savedCatchOfferAudience" checked={catchSaleDraft.offerAudience === "groups"} onChange={() => setCatchSaleDraft((current) => ({ ...current, offerAudience: "groups", selectedBuyerIds: [] }))} />
                    Ostajaryhmille
                  </label>
                  <label style={styles.checkboxCard}>
                    <input type="radio" name="savedCatchOfferAudience" checked={catchSaleDraft.offerAudience === "selected"} onChange={() => setCatchSaleDraft((current) => ({ ...current, offerAudience: "selected", offerToShops: false, offerToRestaurants: false, offerToWholesalers: false }))} />
                    Vain tietyille ostajille
                  </label>
                </div>
                {catchSaleDraft.offerAudience === "selected" ? (
                  <div style={styles.stack}>
                    <select
                      style={styles.input}
                      value=""
                      onChange={(event) => {
                        const buyerId = event.target.value;
                        if (!buyerId) return;
                        setCatchSaleDraft((current) => ({ ...current, selectedBuyerIds: Array.from(new Set([...current.selectedBuyerIds, buyerId])) }));
                      }}
                    >
                      <option value="">Valitse ostaja</option>
                      {(buyers || []).filter((buyer) => buyer.is_active && !catchSaleDraft.selectedBuyerIds.includes(String(buyer.id))).map((buyer) => (
                        <option key={buyer.id} value={String(buyer.id)}>{buyer.company_name || buyer.email || "Nimetön ostaja"}</option>
                      ))}
                    </select>
                    {catchSaleDraft.selectedBuyerIds.map((buyerId) => {
                      const buyer = (buyers || []).find((item) => String(item.id) === String(buyerId));
                      return buyer ? (
                        <div key={buyerId} style={{ ...styles.checkboxCard, justifyContent: "space-between" }}>
                          <strong>{buyer.company_name || buyer.email}</strong>
                          <button style={styles.button} type="button" onClick={() => setCatchSaleDraft((current) => ({ ...current, selectedBuyerIds: current.selectedBuyerIds.filter((id) => id !== buyerId) }))}>Poista</button>
                        </div>
                      ) : null;
                    })}
                  </div>
                ) : (
                  <div style={styles.checkboxRow}>
                    <label style={styles.checkboxCard}><input type="checkbox" checked={catchSaleDraft.offerToShops} onChange={(event) => setCatchSaleDraft((current) => ({ ...current, offerToShops: event.target.checked }))} /> Kauppoihin</label>
                    <label style={styles.checkboxCard}><input type="checkbox" checked={catchSaleDraft.offerToRestaurants} onChange={(event) => setCatchSaleDraft((current) => ({ ...current, offerToRestaurants: event.target.checked }))} /> Ravintoloihin</label>
                    <label style={styles.checkboxCard}><input type="checkbox" checked={catchSaleDraft.offerToWholesalers} onChange={(event) => setCatchSaleDraft((current) => ({ ...current, offerToWholesalers: event.target.checked }))} /> Tukkuihin</label>
                  </div>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", gap: 14, marginTop: 16 }}>
                <div style={styles.field}>
                  <label>Toimitustapa</label>
                  <select style={styles.input} value={catchSaleDraft.deliveryMethod} onChange={(event) => setCatchSaleDraft((current) => ({ ...current, deliveryMethod: event.target.value }))}>
                    {fishermanDeliveryMethods.map((method) => <option key={method} value={method}>{method}</option>)}
                  </select>
                </div>
                <div style={styles.field}>
                  <label>{catchSaleDraft.deliveryMethod === "Nouto" ? "Nouto-osoite" : "Toimitusalue"}</label>
                  <input style={styles.input} value={catchSaleDraft.deliveryArea} onChange={(event) => setCatchSaleDraft((current) => ({ ...current, deliveryArea: event.target.value }))} placeholder={catchSaleDraft.deliveryMethod === "Nouto" ? getDefaultProfilePickupAddress(profile) || "Nouto-osoite" : "Esim. Etelä-Savo"} />
                </div>
                <div style={styles.field}>
                  <label>Toimituskustannus €</label>
                  <input style={styles.input} type="text" inputMode="decimal" value={catchSaleDraft.deliveryCost} onChange={(event) => setCatchSaleDraft((current) => ({ ...current, deliveryCost: event.target.value }))} placeholder="0" />
                </div>
                <div style={styles.field}>
                  <label>Aikaisin toimituspäivä</label>
                  <input style={{ ...styles.input, ...styles.dateInput }} type="date" value={catchSaleDraft.earliestDeliveryDate} onChange={(event) => setCatchSaleDraft((current) => ({ ...current, earliestDeliveryDate: event.target.value }))} />
                </div>
              </div>
              <label style={{ ...styles.checkboxCard, marginTop: 14 }}>
                <input type="checkbox" checked={catchSaleDraft.coldTransport} onChange={(event) => setCatchSaleDraft((current) => ({ ...current, coldTransport: event.target.checked }))} />
                Kylmäkuljetus
              </label>

              {authError ? <div style={{ ...styles.noticeError, marginTop: 16 }}>{authError}</div> : null}
              <div style={{ ...styles.row, marginTop: 18 }}>
                <button
                  type="button"
                  style={{ ...styles.button, background: "linear-gradient(135deg, #059669, #16a34a)", borderColor: "#047857", color: "#ffffff", fontWeight: 800 }}
                  onClick={handlePutSavedCatchOnSale}
                  disabled={catchSaleSaving}
                >
                  {catchSaleSaving ? "Asetetaan myyntiin..." : "Laita erä myyntiin ja lähetä tarjous"}
                </button>
                <button type="button" style={styles.button} onClick={closeCatchSaleDialog} disabled={catchSaleSaving}>Peruuta</button>
              </div>
            </div>
          </div>
        ) : null}

        {labelPrintEntry ? (
          <CatchLabelPrintModal
            entry={labelPrintEntry}
            profile={profile}
            labelCount={labelPrintCount}
            setLabelCount={setLabelPrintCount}
            pieceCount={labelPrintPieceCount}
            setPieceCount={setLabelPrintPieceCount}
            weightKg={labelPrintWeightKg}
            setWeightKg={setLabelPrintWeightKg}
            productForm={labelPrintProductForm}
            setProductForm={setLabelPrintProductForm}
            useByDate={labelPrintUseByDate}
            setUseByDate={setLabelPrintUseByDate}
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
