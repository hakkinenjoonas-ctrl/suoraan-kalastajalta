import { COMMISSION_RATE } from "./constants.js";
import { FISH_VAT_RATE } from "./pricing.js";

export const CONSUMER_MARKET_QUERY_VALUE = "consumer";
export const CONSUMER_MARKET_PATH = "/kuluttaja";

export function getRequestedConsumerListingId(locationLike = typeof window !== "undefined" ? window.location : null) {
  if (!locationLike) return "";
  const pathname = String(locationLike.pathname || "");
  const pathMatch = pathname.match(/^\/kuluttaja\/era\/([^/?#]+)/);
  if (pathMatch) return decodeURIComponent(pathMatch[1]).trim();
  const params = new URLSearchParams(locationLike.search || "");
  return String(params.get("listing") || "").trim();
}

export function getConsumerListingPath(listingId = "") {
  const id = String(listingId || "").trim();
  return id ? `${CONSUMER_MARKET_PATH}/era/${encodeURIComponent(id)}` : CONSUMER_MARKET_PATH;
}

export function getConsumerListingUrl(listingId, baseUrl) {
  const fallbackBase = typeof window !== "undefined" ? window.location.origin : "";
  return `${String(baseUrl || fallbackBase).replace(/\/$/, "")}${getConsumerListingPath(listingId)}`;
}

export function getConsumerAppDeepLink(listingId) {
  const id = String(listingId || "").trim();
  return id ? `fi.suoraankalastajalta.app:///kuluttaja/era/${encodeURIComponent(id)}` : "fi.suoraankalastajalta.app:///kuluttaja";
}

export function isConsumerMarketplaceRequested(locationLike = typeof window !== "undefined" ? window.location : null) {
  if (!locationLike) return false;
  if (String(locationLike.pathname || "").startsWith(CONSUMER_MARKET_PATH)) return true;
  const params = new URLSearchParams(locationLike.search || "");
  return params.get("market") === CONSUMER_MARKET_QUERY_VALUE;
}

export function isConsumerDemoRequested(locationLike = typeof window !== "undefined" ? window.location : null) {
  if (!locationLike) return false;
  const params = new URLSearchParams(locationLike.search || "");
  return params.get("demo") === "1";
}

export function calculateConsumerOrderTotals({ packagePrice, packageCount, vatRate = FISH_VAT_RATE, commissionRate = COMMISSION_RATE }) {
  const grossTotal = Number(packagePrice || 0) * Number(packageCount || 0);
  const netTotal = vatRate >= 0 ? grossTotal / (1 + vatRate) : grossTotal;
  const vatAmount = grossTotal - netTotal;
  const commissionAmount = netTotal * commissionRate;
  return {
    grossTotal: Number(grossTotal.toFixed(2)),
    netTotal: Number(netTotal.toFixed(2)),
    vatAmount: Number(vatAmount.toFixed(2)),
    commissionAmount: Number(commissionAmount.toFixed(2)),
  };
}

export function normalizeConsumerListing(row = {}) {
  const rawVariants = Array.isArray(row.variants) ? row.variants : [];
  const variants = rawVariants.length > 0
    ? rawVariants.map((variant, index) => normalizeConsumerVariant(variant, index))
    : [normalizeConsumerVariant({
        id: `${row.id || "listing"}-package`,
        sale_unit_type: "package",
        label: row.package_size_kg ? `${row.package_size_kg} kg pakkaus` : "Pakkaus",
        package_size_kg: row.package_size_kg,
        unit_price_including_vat: row.package_price_including_vat,
        available_units: row.available_packages,
      }, 0)];
  return {
    id: String(row.id || ""),
    batchId: String(row.batch_id || row.batchId || ""),
    species: String(row.species || "Kalaerä"),
    productName: String(row.product_name || row.productName || row.species || "Kalaerä"),
    description: String(row.description || ""),
    sellerName: String(row.seller_name || row.sellerName || "Paikallinen kalastaja"),
    municipality: String(row.municipality || ""),
    pickupLocation: String(row.pickup_location || row.pickupLocation || ""),
    catchDate: String(row.catch_date || row.catchDate || ""),
    packageSizeKg: Number(row.package_size_kg || row.packageSizeKg || 0),
    packagePrice: Number(row.package_price_including_vat || row.packagePrice || 0),
    availablePackages: Math.max(0, Number(row.available_packages ?? row.availablePackages ?? 0)),
    vatRate: Number(row.vat_rate ?? row.vatRate ?? FISH_VAT_RATE),
    imageUrl: String(row.image_url || row.imageUrl || ""),
    coldStorage: row.cold_storage !== false,
    pickupStart: String(row.pickup_start || row.pickupStart || ""),
    pickupEnd: String(row.pickup_end || row.pickupEnd || ""),
    orderDeadline: String(row.order_deadline || row.orderDeadline || ""),
    status: String(row.status || "published"),
    variants,
    availableUnits: variants.reduce((sum, variant) => sum + variant.availableUnits, 0),
  };
}

export function normalizeConsumerVariant(row = {}, index = 0) {
  const unitType = row.sale_unit_type === "whole_fish" || row.unitType === "whole_fish" ? "whole_fish" : "package";
  const minWeightKg = Number(row.min_weight_kg ?? row.minWeightKg ?? 0);
  const maxWeightKg = Number(row.max_weight_kg ?? row.maxWeightKg ?? minWeightKg);
  return {
    id: String(row.id || `variant-${index + 1}`),
    unitType,
    label: String(row.label || (unitType === "whole_fish" ? "Kokonainen kala" : "Pakkaus")),
    packageSizeKg: Number(row.package_size_kg ?? row.packageSizeKg ?? 0),
    unitPrice: Number(row.unit_price_including_vat ?? row.unitPrice ?? 0),
    minWeightKg,
    maxWeightKg,
    pricePerKg: Number(row.price_per_kg_including_vat ?? row.pricePerKg ?? 0),
    availableUnits: Math.max(0, Number(row.available_units ?? row.availableUnits ?? 0)),
  };
}

export function calculateConsumerReservationEstimate({ variant, unitCount, vatRate = FISH_VAT_RATE, commissionRate = COMMISSION_RATE }) {
  const count = Math.max(0, Number(unitCount || 0));
  const estimatedUnitWeight = variant?.unitType === "whole_fish"
    ? (Number(variant.minWeightKg || 0) + Number(variant.maxWeightKg || 0)) / 2
    : Number(variant?.packageSizeKg || 0);
  const estimatedWeightKg = estimatedUnitWeight * count;
  const grossTotal = variant?.unitType === "whole_fish"
    ? estimatedWeightKg * Number(variant.pricePerKg || 0)
    : count * Number(variant?.unitPrice || 0);
  const totals = calculateConsumerOrderTotals({ packagePrice: grossTotal, packageCount: 1, vatRate, commissionRate });
  return { ...totals, estimatedWeightKg: Number(estimatedWeightKg.toFixed(3)), isEstimate: variant?.unitType === "whole_fish" };
}

export function filterConsumerListings(listings, { search = "", species = "", municipality = "" } = {}) {
  const query = String(search || "").trim().toLocaleLowerCase("fi-FI");
  return (listings || []).filter((listing) => {
    if (listing.status !== "published" || Number(listing.availableUnits || listing.availablePackages || 0) <= 0) return false;
    if (species && listing.species !== species) return false;
    if (municipality && listing.municipality !== municipality) return false;
    if (!query) return true;
    return [listing.species, listing.productName, listing.description, listing.sellerName, listing.municipality, listing.pickupLocation]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("fi-FI")
      .includes(query);
  });
}

export function createConsumerDemoListings() {
  return [
    {
      id: "demo-kuha",
      batch_id: "B2C-DEMO-001",
      species: "Kuha",
      product_name: "Tuore kokonainen kuha",
      description: "Järveltä samana aamuna. Perattu ja jäitetty heti pyynnin jälkeen.",
      seller_name: "Saimaan kalastaja",
      municipality: "Puumala",
      pickup_location: "Puumalan satama",
      catch_date: "2026-08-31",
      package_size_kg: 1.5,
      package_price_including_vat: 24.9,
      available_packages: 6,
      variants: [
        { id: "kuha-small", sale_unit_type: "whole_fish", label: "Pieni kuha", min_weight_kg: 0.8, max_weight_kg: 1.2, price_per_kg_including_vat: 16.9, available_units: 5 },
        { id: "kuha-medium", sale_unit_type: "whole_fish", label: "Keskikokoinen kuha", min_weight_kg: 1.2, max_weight_kg: 1.8, price_per_kg_including_vat: 18.9, available_units: 3 },
      ],
      vat_rate: FISH_VAT_RATE,
      cold_storage: true,
      pickup_start: "2026-09-02T14:00:00+03:00",
      pickup_end: "2026-09-02T18:00:00+03:00",
      status: "published",
    },
    {
      id: "demo-ahven",
      batch_id: "B2C-DEMO-002",
      species: "Ahven",
      product_name: "Ahvenfilee",
      description: "Nahaton filee, pakattu 500 gramman kylmäpakkauksiin.",
      seller_name: "Lähikala Saimaa",
      municipality: "Mikkeli",
      pickup_location: "Mikkelin kauppatori",
      catch_date: "2026-09-01",
      package_size_kg: 0.5,
      package_price_including_vat: 14.5,
      available_packages: 12,
      variants: [
        { id: "ahven-500", sale_unit_type: "package", label: "500 g pakkaus", package_size_kg: 0.5, unit_price_including_vat: 14.5, available_units: 12 },
        { id: "ahven-1000", sale_unit_type: "package", label: "1 kg pakkaus", package_size_kg: 1, unit_price_including_vat: 27.5, available_units: 5 },
      ],
      vat_rate: FISH_VAT_RATE,
      cold_storage: true,
      pickup_start: "2026-09-02T10:00:00+03:00",
      pickup_end: "2026-09-02T15:00:00+03:00",
      status: "published",
    },
    {
      id: "demo-muikku",
      batch_id: "B2C-DEMO-003",
      species: "Muikku",
      product_name: "Puhdistettu muikku",
      description: "Valmiiksi puhdistettu ja ruoanlaittoon valmis.",
      seller_name: "Puruveden Kala",
      municipality: "Savonlinna",
      pickup_location: "Savonlinnan satama",
      catch_date: "2026-09-01",
      package_size_kg: 1,
      package_price_including_vat: 12.9,
      available_packages: 9,
      variants: [
        { id: "muikku-500", sale_unit_type: "package", label: "500 g pakkaus", package_size_kg: 0.5, unit_price_including_vat: 6.9, available_units: 20 },
        { id: "muikku-1000", sale_unit_type: "package", label: "1 kg pakkaus", package_size_kg: 1, unit_price_including_vat: 12.9, available_units: 9 },
        { id: "muikku-2000", sale_unit_type: "package", label: "2 kg pakkaus", package_size_kg: 2, unit_price_including_vat: 24.5, available_units: 4 },
      ],
      vat_rate: FISH_VAT_RATE,
      cold_storage: true,
      pickup_start: "2026-09-02T12:00:00+03:00",
      pickup_end: "2026-09-02T17:00:00+03:00",
      status: "published",
    },
  ].map(normalizeConsumerListing);
}
