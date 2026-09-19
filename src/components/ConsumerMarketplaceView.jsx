import React, { useEffect, useMemo, useState } from "react";
import { calculateConsumerReservationBasket, filterConsumerListings, formatConsumerPaymentMethods, getConsumerAppDeepLink, getConsumerListingPath, normalizeConsumerQuantityInput } from "../lib/consumerMarketplace.js";

const LEGAL_TERMS_URL = "https://www.suoraankalastajalta.fi/tietosuojaseloste-ja-k%C3%A4ytt%C3%B6ehdot";
const money = (value) => `${Number(value || 0).toLocaleString("fi-FI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const quantity = (value) => Number(value || 0).toLocaleString("fi-FI", { maximumFractionDigits: 2 });
const dateTime = (value) => value ? new Date(value).toLocaleString("fi-FI", { dateStyle: "short", timeStyle: "short" }) : "Sovitaan myyjän kanssa";
const time = (value) => value ? new Date(value).toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit" }) : "";

export function variantOptionLabel(variant) {
  const label = String(variant?.label || "").trim();
  const labelNumbers = [...label.matchAll(/\d+(?:[.,]\d+)?/g)].map((match) => Number(match[0].replace(",", ".")));
  const includesNumber = (value) => labelNumbers.some((number) => Math.abs(number - Number(value)) < 0.001);
  if (variant?.unitType === "whole_fish") {
    const detail = `${quantity(variant.minWeightKg)}–${quantity(variant.maxWeightKg)} kg/kpl · ${money(variant.pricePerKg)}/kg`;
    return label && !(includesNumber(variant.minWeightKg) && includesNumber(variant.maxWeightKg)) ? `${label} · ${detail}` : detail;
  }
  if (variant?.unitType === "piece") {
    return `${label || "Rapu"} · ${money(variant?.unitPrice)}/kpl`;
  }
  const detail = `${quantity(variant?.packageSizeKg)} kg · ${money(variant?.unitPrice)}`;
  return label && !includesNumber(variant?.packageSizeKg) ? `${label} · ${detail}` : detail;
}

function pickupWindow(start, end) {
  if (!start) return "Sovitaan myyjän kanssa";
  const startDate = new Date(start);
  const date = startDate.toLocaleDateString("fi-FI", { weekday: "short", day: "numeric", month: "numeric" });
  return `${date} klo ${time(start)}${end ? `–${time(end)}` : ""}`;
}

export function pickupPlace(listing) {
  const location = String(listing?.pickupLocation || listing?.pickup_location || "").trim();
  const municipality = String(listing?.municipality || "").trim();
  if (!location) return municipality || "Noutopaikka vahvistetaan";
  if (!municipality || location.toLocaleLowerCase("fi-FI").includes(municipality.toLocaleLowerCase("fi-FI"))) return location;
  return `${location}, ${municipality}`;
}

export function reservationUnitLabel(variant) {
  return variant?.unitType === "piece" || variant?.unitType === "whole_fish" ? "kpl" : "pakkausta";
}

function orderingClosed(listing) {
  const deadline = Date.parse(listing?.orderDeadline || "");
  return Number.isFinite(deadline) && deadline <= Date.now();
}

function FishPlaceholder({ species }) {
  return (
    <div className="consumer-fish-placeholder" aria-label={`${species} – kuva tulossa`}>
      <span aria-hidden="true">🐟</span>
      <small>Kuva tulossa</small>
    </div>
  );
}

function getStartingPrice(listing) {
  const prices = (listing.variants || [])
    .map((variant) => variant.unitType === "whole_fish" ? variant.pricePerKg : variant.unitPrice)
    .filter((value) => Number(value) > 0);
  return prices.length > 0 ? Math.min(...prices) : 0;
}

function listingUnitType(listing) {
  if ((listing.variants || []).some((variant) => variant.unitType === "piece")) return "piece";
  if ((listing.variants || []).some((variant) => variant.unitType === "whole_fish")) return "whole_fish";
  return "package";
}

export default function ConsumerMarketplaceView({
  listings,
  soldListings = [],
  orders,
  loading,
  error,
  user,
  consumerProfile,
  alertSubscriptions = [],
  busy,
  message,
  initialListingId = "",
  onOpenAuth,
  onReturnToMainApp,
  onSignOut,
  onSaveOwnDetails,
  onDeleteOwnAccount,
  onRefresh,
  onReserve,
  onSubscribe,
  onUnsubscribe,
}) {
  const [search, setSearch] = useState("");
  const [species, setSpecies] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [soldOpen, setSoldOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [handledInitialListingId, setHandledInitialListingId] = useState("");
  const [variantQuantities, setVariantQuantities] = useState({});
  const [customerName, setCustomerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [reservationError, setReservationError] = useState("");
  const [alertsOpen, setAlertsOpen] = useState(() => typeof window !== "undefined" && window.location.hash === "#kalaerailmoitukset");
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountForm, setAccountForm] = useState({ displayName: "", phone: "" });
  const [alertSpecies, setAlertSpecies] = useState("");
  const [alertMunicipality, setAlertMunicipality] = useState("");

  const speciesOptions = useMemo(() => Array.from(new Set(listings.map((item) => item.species).filter(Boolean))).sort(), [listings]);
  const municipalityOptions = useMemo(() => Array.from(new Set(listings.map((item) => item.municipality).filter(Boolean))).sort(), [listings]);
  const visibleListings = useMemo(() => filterConsumerListings(listings, { search, species, municipality }), [listings, search, species, municipality]);
  const groupedOrders = useMemo(() => {
    const groups = new Map();
    orders.forEach((order) => {
      const key = order.reservation_group_id || order.id;
      if (!groups.has(key)) groups.set(key, { id: key, orders: [], first: order });
      groups.get(key).orders.push(order);
    });
    return Array.from(groups.values());
  }, [orders]);
  const totals = selected ? calculateConsumerReservationBasket({ variants: selected.variants, quantities: variantQuantities, vatRate: selected.vatRate }) : null;

  useEffect(() => {
    const accountName = String(consumerProfile?.displayName || user?.user_metadata?.display_name || "").trim();
    if (accountName) setCustomerName((current) => current || accountName);
    const accountEmail = String(user?.email || "").trim();
    if (accountEmail) setEmail((current) => current || accountEmail);
    const accountPhone = String(consumerProfile?.phone || "").trim();
    if (accountPhone) setPhone((current) => current || accountPhone);
    setAccountForm({ displayName: accountName, phone: accountPhone });
  }, [consumerProfile, user]);

  useEffect(() => {
    if (!user) {
      setMenuOpen(false);
      setAccountOpen(false);
    }
  }, [user]);

  const openListing = (listing, updateUrl = true) => {
    setSelected(listing);
    setVariantQuantities({});
    setNote("");
    setAcceptedTerms(false);
    setReservationError("");
    if (updateUrl && typeof window !== "undefined") {
      window.history.pushState({}, "", getConsumerListingPath(listing.id));
    }
  };

  const closeListing = () => {
    setSelected(null);
    if (typeof window !== "undefined") window.history.replaceState({}, "", getConsumerListingPath());
  };

  useEffect(() => {
    if (!initialListingId || initialListingId === handledInitialListingId || listings.length === 0) return;
    const linkedListing = listings.find((listing) => listing.id === initialListingId);
    if (linkedListing && selected?.id !== linkedListing.id) openListing(linkedListing, false);
    setHandledInitialListingId(initialListingId);
  }, [handledInitialListingId, initialListingId, listings, selected?.id]);

  const submitReservation = async () => {
    if (!totals?.lines.length) {
      setReservationError("Valitse vähintään yksi myyntivaihtoehto ja määrä.");
      return;
    }
    if (customerName.trim().length < 2) {
      setReservationError("Täytä varaajan nimi.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setReservationError("Täytä voimassa oleva sähköpostiosoite.");
      return;
    }
    if (phone.trim().length < 5) {
      setReservationError("Täytä puhelinnumero noutoa varten.");
      return;
    }
    if (!acceptedTerms) {
      setReservationError("Hyväksy käyttöehdot ennen maksullisen varauksen vahvistamista.");
      return;
    }
    setReservationError("");
    const ok = await onReserve({ listing: selected, lines: totals?.lines || [], customerName, email, phone, note });
    if (ok) closeListing();
  };

  return (
    <div className="consumer-marketplace">
      <style>{`
        :root { color-scheme: light; }
        * { box-sizing: border-box; }
        body { margin: 0; background: #eff6ff; }
        button, input, select, textarea { font: inherit; }
        .consumer-marketplace { min-height: 100dvh; color: #0f172a; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: radial-gradient(circle at top left, rgba(191,219,254,.55) 0%, rgba(239,246,255,.96) 26%, rgba(219,234,254,.82) 54%, rgba(239,246,255,1) 100%); }
        .consumer-shell { width: min(1320px, 100%); margin: 0 auto; padding: 20px clamp(14px, 3vw, 36px) 96px; }
        .consumer-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
        .consumer-button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: 1px solid rgba(147,197,253,.78); border-radius: 16px; background: rgba(255,255,255,.94); color: #1e3a8a; min-height: 46px; padding: 11px 17px; font-weight: 750; cursor: pointer; box-shadow: 0 10px 22px rgba(37,99,235,.08); }
        .consumer-button:hover { border-color: #60a5fa; background: #fff; }
        .consumer-primary { border-color: #2563eb; background: linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%); color: #fff; box-shadow: 0 14px 28px rgba(37,99,235,.24); }
        .consumer-primary:disabled, .consumer-button:disabled { opacity: .58; cursor: wait; }
        .consumer-hero { display: flex; align-items: center; justify-content: space-between; gap: 24px; min-height: 154px; margin-bottom: 18px; padding: 24px clamp(22px, 4vw, 38px); border: 1px solid rgba(125,176,255,.38); border-radius: 30px; color: #fff; background: linear-gradient(135deg, #0f3d5e 0%, #087ea4 52%, #10a37f 115%); box-shadow: 0 22px 48px rgba(8,126,164,.24); overflow: visible; position: relative; }
        .consumer-hero:after { content: ""; position: absolute; width: 190px; height: 72px; border-radius: 190px 190px 0 0; right: 24%; bottom: 0; background: rgba(255,255,255,.08); pointer-events: none; }
        .consumer-hero-brand { display: flex; align-items: center; gap: clamp(20px, 3vw, 38px); min-width: 0; position: relative; z-index: 1; }
        .consumer-hero-brand img { width: clamp(112px, 13vw, 148px); height: clamp(112px, 13vw, 148px); object-fit: contain; flex: 0 0 auto; transform: scale(1.65); transform-origin: center; filter: drop-shadow(0 9px 18px rgba(0,0,0,.18)); }
        .consumer-hero-brand h1 { margin: 0; font-size: clamp(27px, 4vw, 40px); line-height: 1; letter-spacing: -.045em; }
        .consumer-hero-brand p { margin: 7px 0 0; color: rgba(255,255,255,.86); font-size: clamp(14px, 2vw, 17px); font-weight: 650; }
        .consumer-hero .consumer-actions { position: relative; z-index: 1; }
        .consumer-hero .consumer-button { border-color: rgba(255,255,255,.62); background: rgba(255,255,255,.94); color: #1e3a8a; }
        .consumer-hero .consumer-primary { border-color: #fff; background: #fff; color: #1d4ed8; box-shadow: 0 12px 26px rgba(15,23,42,.18); }
        .consumer-menu-wrap { position: relative; z-index: 5; }
        .consumer-menu-toggle { width: 52px; min-width: 52px; height: 52px; padding: 0; border: 1px solid rgba(255,255,255,.68); border-radius: 17px; background: rgba(255,255,255,.96); color: #0f3d5e; box-shadow: 0 12px 28px rgba(15,23,42,.2); cursor: pointer; font-size: 26px; font-weight: 900; line-height: 1; }
        .consumer-menu-backdrop { position: fixed; inset: 0; z-index: 4; border: 0; background: transparent; cursor: default; }
        .consumer-menu { position: absolute; z-index: 6; top: calc(100% + 10px); right: 0; width: min(300px, calc(100vw - 28px)); display: grid; gap: 6px; padding: 10px; border: 1px solid rgba(147,197,253,.72); border-radius: 20px; background: rgba(255,255,255,.98); box-shadow: 0 24px 58px rgba(15,23,42,.28); color: #0f172a; backdrop-filter: blur(16px); }
        .consumer-menu-account { padding: 8px 10px 11px; border-bottom: 1px solid #dbeafe; overflow-wrap: anywhere; }
        .consumer-menu-account strong { display: block; font-size: 15px; }
        .consumer-menu-account span { display: block; margin-top: 3px; color: #64748b; font-size: 12px; }
        .consumer-menu-item { width: 100%; min-height: 44px; display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 0; border-radius: 13px; background: transparent; color: #1e3a8a; text-align: left; font-weight: 800; cursor: pointer; }
        .consumer-menu-item:hover { background: #eff6ff; }
        .consumer-account-danger { margin-top: 8px; padding-top: 12px; border-top: 1px solid #e2e8f0; }
        .consumer-account-danger summary { color: #64748b; font-size: 13px; font-weight: 750; cursor: pointer; user-select: none; }
        .consumer-account-danger-content { display: grid; gap: 9px; margin-top: 11px; padding: 12px; border: 1px solid #fecaca; border-radius: 15px; background: #fff7f7; }
        .consumer-account-delete { min-height: 42px; border-color: #fca5a5; background: #fff; color: #b91c1c; box-shadow: none; }
        .consumer-kicker { text-transform: uppercase; letter-spacing: .13em; font-size: 12px; font-weight: 850; opacity: .82; }
        .consumer-filters { display: grid; grid-template-columns: minmax(220px, 1fr) repeat(2, minmax(170px, .42fr)); gap: 10px; padding: 12px; margin: 16px 0; border-radius: 22px; background: rgba(255,255,255,.78); border: 1px solid rgba(147,197,253,.48); box-shadow: 0 16px 36px rgba(37,99,235,.07); backdrop-filter: blur(10px); }
        .consumer-input { width: 100%; min-height: 48px; border: 1px solid rgba(147,197,253,.78); border-radius: 16px; padding: 12px 14px; background: rgba(255,255,255,.96); color: #0f172a; outline: none; box-shadow: inset 0 1px 0 rgba(255,255,255,.68); }
        .consumer-input:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,.14); }
        .consumer-list-heading { display: flex; align-items: end; justify-content: space-between; gap: 12px; margin: 20px 0 12px; }
        .consumer-list-heading h2 { margin: 0; font-size: clamp(25px, 4vw, 34px); letter-spacing: -.035em; }
        .consumer-list-heading span { color: #475569; font-weight: 650; }
        .consumer-list-controls { display: flex; align-items: center; justify-content: flex-end; gap: 9px; }
        .consumer-refresh { min-height: 38px; padding: 7px 12px; border-radius: 13px; box-shadow: none; }
        .consumer-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
        .consumer-sold-section { margin-top: 15px; }
        .consumer-sold-toggle { width: 100%; min-height: 58px; display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 14px 18px; border: 1px solid rgba(147,197,253,.72); border-radius: 19px; background: rgba(255,255,255,.78); color: #1e3a8a; box-shadow: 0 12px 28px rgba(37,99,235,.06); cursor: pointer; text-align: left; }
        .consumer-sold-toggle strong { font-size: 18px; }
        .consumer-sold-toggle span { color: #64748b; font-size: 13px; font-weight: 750; }
        .consumer-sold-grid { margin-top: 12px; }
        .consumer-card-sold { opacity: .62; filter: saturate(.52); }
        .consumer-card-sold .consumer-card-image { filter: grayscale(.28); }
        .consumer-sold-badge { display: inline-flex; align-items: center; align-self: flex-start; border: 1px solid #cbd5e1; border-radius: 999px; padding: 6px 10px; background: #f1f5f9; color: #475569; font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: .06em; }
        .consumer-card { display: flex; flex-direction: column; min-width: 0; border: 1px solid rgba(191,219,254,.9); border-radius: 24px; overflow: hidden; background: rgba(255,255,255,.9); box-shadow: 0 18px 38px rgba(37,99,235,.08); backdrop-filter: blur(10px); }
        .consumer-card-image, .consumer-fish-placeholder { height: 180px; width: 100%; object-fit: cover; background: linear-gradient(145deg, #dbeafe, #e0f2fe 55%, #ccfbf1); }
        .consumer-fish-placeholder { display: grid; place-items: center; align-content: center; gap: 5px; color: #1e40af; }
        .consumer-fish-placeholder span { font-size: 58px; filter: grayscale(.2); }
        .consumer-card-body { display: flex; flex: 1; flex-direction: column; padding: 18px; gap: 12px; }
        .consumer-card h3 { margin: 0; font-size: 21px; letter-spacing: -.025em; }
        .consumer-meta { display: flex; gap: 7px; flex-wrap: wrap; }
        .consumer-pill { border: 1px solid rgba(147,197,253,.8); border-radius: 999px; padding: 6px 9px; background: rgba(239,246,255,.96); color: #1e3a8a; font-size: 12px; font-weight: 750; }
        .consumer-description { color: #475569; line-height: 1.45; font-size: 14px; flex: 1; }
        .consumer-price-row { display: flex; align-items: end; justify-content: space-between; gap: 10px; }
        .consumer-price { font-size: 25px; font-weight: 900; letter-spacing: -.035em; }
        .consumer-price small { display: block; font-size: 12px; font-weight: 650; color: #64748b; letter-spacing: 0; }
        .consumer-notice, .consumer-empty { border: 1px solid rgba(191,219,254,.9); border-radius: 18px; padding: 16px; background: rgba(255,255,255,.88); color: #475569; box-shadow: 0 12px 28px rgba(37,99,235,.06); }
        .consumer-success { border-color: #91c9ac; background: #ebf8f0; color: #145c3d; }
        .consumer-orders { margin-top: 34px; padding-top: 26px; border-top: 1px solid rgba(147,197,253,.55); }
        .consumer-orders-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
        .consumer-order-card { min-width: 0; overflow: hidden; border: 1px solid rgba(147,197,253,.72); border-radius: 24px; background: rgba(255,255,255,.94); box-shadow: 0 18px 38px rgba(37,99,235,.09); }
        .consumer-order-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 13px 16px; color: #fff; background: linear-gradient(135deg, #0f3d5e 0%, #087ea4 70%, #10a37f 130%); }
        .consumer-order-head strong { font-size: 12px; letter-spacing: .08em; }
        .consumer-order-status { border: 1px solid rgba(255,255,255,.55); border-radius: 999px; padding: 5px 9px; background: rgba(255,255,255,.16); font-size: 12px; font-weight: 850; }
        .consumer-order-body { display: grid; gap: 13px; padding: 17px; }
        .consumer-order-product { display: flex; justify-content: space-between; align-items: start; gap: 14px; }
        .consumer-order-product h3 { margin: 0 0 5px; font-size: 23px; letter-spacing: -.03em; }
        .consumer-order-price { flex: 0 0 auto; color: #1e3a8a; font-size: 23px; font-weight: 900; white-space: nowrap; }
        .consumer-order-lines { display: grid; gap: 3px; color: #475569; font-size: 14px; }
        .consumer-order-pickup { display: grid; gap: 10px; padding: 14px; border: 1px solid rgba(125,211,252,.68); border-radius: 18px; background: linear-gradient(140deg, #eff6ff 0%, #ecfeff 100%); }
        .consumer-order-pickup-label { color: #087ea4; font-size: 11px; font-weight: 900; letter-spacing: .11em; text-transform: uppercase; }
        .consumer-order-pickup-time { display: block; margin-top: 3px; color: #0f172a; font-size: 18px; line-height: 1.25; }
        .consumer-order-location { display: flex; align-items: flex-start; gap: 8px; color: #334155; font-size: 15px; font-weight: 700; line-height: 1.35; }
        .consumer-order-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 2px; color: #64748b; font-size: 13px; }
        .consumer-alert-saved { display: grid; gap: 9px; padding: 14px; border: 1px solid rgba(125,211,252,.72); border-radius: 18px; background: linear-gradient(140deg, #eff6ff 0%, #ecfeff 100%); }
        .consumer-alert-saved-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .consumer-alert-saved-head strong { color: #0f3d5e; font-size: 16px; }
        .consumer-alert-count { border-radius: 999px; padding: 4px 8px; background: #dbeafe; color: #1e40af; font-size: 12px; font-weight: 850; }
        .consumer-alert-saved-list { display: grid; gap: 7px; }
        .consumer-alert-saved-item { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 10px 11px; border: 1px solid rgba(191,219,254,.9); border-radius: 14px; background: rgba(255,255,255,.92); color: #334155; font-size: 13px; font-weight: 750; }
        .consumer-alert-saved-item span { display: flex; align-items: center; gap: 6px; min-width: 0; }
        .consumer-overlay { position: fixed; inset: 0; z-index: 3000; display: grid; place-items: center; padding: 14px; background: rgba(15,23,42,.58); backdrop-filter: blur(8px); }
        .consumer-dialog { width: min(620px, 100%); max-height: calc(100dvh - 28px); overflow-y: auto; border: 1px solid rgba(147,197,253,.55); border-radius: 24px; background: rgba(255,255,255,.97); padding: clamp(19px, 4vw, 30px); box-shadow: 0 28px 90px rgba(30,64,175,.24); }
        .consumer-dialog-head { display: flex; justify-content: space-between; gap: 16px; align-items: start; }
        .consumer-dialog h2 { margin: 0; font-size: 28px; letter-spacing: -.04em; }
        .consumer-close { width: 42px; height: 42px; border-radius: 16px; border: 1px solid rgba(147,197,253,.72); background: #eff6ff; color: #1e3a8a; cursor: pointer; }
        .consumer-summary { display: grid; gap: 7px; margin: 18px 0; padding: 15px; border: 1px solid rgba(191,219,254,.76); border-radius: 18px; background: linear-gradient(140deg, rgba(248,250,252,.98), rgba(239,246,255,.98)); }
        .consumer-form { display: grid; gap: 13px; }
        .consumer-submit-bar { position: sticky; bottom: -1px; z-index: 3; display: grid; gap: 8px; margin: 0 -2px -2px; padding: 12px 2px max(2px, env(safe-area-inset-bottom)); border-top: 1px solid rgba(147,197,253,.5); background: linear-gradient(180deg, rgba(255,255,255,.88), #fff 24%); }
        .consumer-submit-bar .consumer-button { width: 100%; }
        .consumer-form-error { border: 1px solid #fecaca; border-radius: 13px; padding: 9px 11px; background: #fff1f2; color: #b91c1c; font-size: 13px; font-weight: 750; }
        .consumer-variant-list { display: grid; gap: 10px; }
        .consumer-variant-row { display: grid; grid-template-columns: minmax(0, 1fr) 132px; align-items: center; gap: 12px; padding: 12px; border: 1px solid rgba(191,219,254,.76); border-radius: 16px; background: #fff; }
        .consumer-variant-row strong { display: block; color: #1e3a8a; }
        .consumer-variant-row .consumer-input { text-align: center; }
        .consumer-variant-price { display: block; margin-top: 3px; color: #0f172a; font-size: 14px; font-weight: 750; }
        .consumer-quantity-field { display: grid; gap: 5px; color: #334155; font-size: 12px; font-weight: 850; }
        .consumer-quantity-input { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 7px; }
        .consumer-quantity-input > span { color: #334155; font-size: 13px; font-weight: 850; }
        .consumer-field { display: grid; gap: 6px; }
        .consumer-field label { font-size: 13px; font-weight: 800; color: #334155; }
        .consumer-total { display: flex; justify-content: space-between; gap: 12px; font-size: 21px; font-weight: 900; }
        .consumer-small { font-size: 12px; color: #64748b; line-height: 1.45; }
        @media (max-width: 850px) { .consumer-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .consumer-orders-grid { grid-template-columns: 1fr; } .consumer-hero { align-items: flex-start; } }
        @media (max-width: 620px) { .consumer-shell { padding-top: 8px; } .consumer-hero { min-height: 0; border-radius: 24px; padding: 18px; gap: 12px; } .consumer-hero-brand { width: calc(100% - 64px); gap: 14px; } .consumer-hero-brand img { width: clamp(88px, 28vw, 116px); height: clamp(88px, 28vw, 116px); margin-top: -12px; transform: scale(1.45); } .consumer-hero-brand h1 { font-size: clamp(24px, 8vw, 32px); } .consumer-hero-brand p { margin-top: 5px; font-size: 13px; } .consumer-hero .consumer-actions { position: absolute; top: 14px; right: 14px; width: auto; } .consumer-menu-toggle { width: 48px; min-width: 48px; height: 48px; } .consumer-filters { grid-template-columns: 1fr; } .consumer-grid { grid-template-columns: 1fr; } .consumer-card { flex-direction: row; } .consumer-card-image, .consumer-fish-placeholder { width: 34%; min-width: 118px; height: auto; min-height: 210px; } .consumer-fish-placeholder span { font-size: 42px; } .consumer-card-body { padding: 15px; } .consumer-price-row { align-items: center; } .consumer-order-product { gap: 9px; } .consumer-order-product h3, .consumer-order-price { font-size: 21px; } .consumer-order-footer { align-items: flex-start; flex-direction: column; gap: 5px; } }
      `}</style>

      <main className="consumer-shell">
        <section className="consumer-hero">
          <a className="consumer-hero-brand" href="/kuluttaja" style={{ color: "inherit", textDecoration: "none" }}>
            <div><h1>Suoraan Kalastajalta</h1><p>Tuoretta lähikalaa ilman välikäsiä</p></div>
            <img src="/logo.png" alt="Suoraan Kalastajalta" />
          </a>
          <div className="consumer-actions">
            {onReturnToMainApp ? <button className="consumer-button consumer-primary" onClick={onReturnToMainApp}>Palaa kalastajanäkymään</button> : null}
            <div className="consumer-menu-wrap">
              <button type="button" className="consumer-menu-toggle" aria-label="Avaa valikko" aria-expanded={menuOpen} onClick={() => setMenuOpen((current) => !current)}>☰</button>
              {menuOpen ? (
                <>
                  <button type="button" className="consumer-menu-backdrop" aria-label="Sulje valikko" onClick={() => setMenuOpen(false)} />
                  <nav className="consumer-menu" aria-label="Kuluttajatilin valikko">
                    {user ? <div className="consumer-menu-account"><strong>{consumerProfile?.displayName || user.user_metadata?.display_name || "Kuluttaja"}</strong><span>{user.email}</span></div> : null}
                    {user ? <button type="button" className="consumer-menu-item" onClick={() => { setMenuOpen(false); setAccountOpen(true); }}>👤 Omat tiedot</button> : null}
                    <button type="button" className="consumer-menu-item" onClick={() => { setMenuOpen(false); setAlertsOpen(true); }}>🔔 Kalaeräilmoitukset</button>
                    {user ? <button type="button" className="consumer-menu-item" onClick={() => { setMenuOpen(false); onSignOut(); }}>↪ Kirjaudu ulos</button> : <button type="button" className="consumer-menu-item" onClick={() => { setMenuOpen(false); onOpenAuth({}); }}>↪ Kirjaudu</button>}
                  </nav>
                </>
              ) : null}
            </div>
          </div>
        </section>

        {message ? <div className="consumer-notice consumer-success">{message}</div> : null}
        {error ? <div className="consumer-notice">{error}</div> : null}

        <section className="consumer-filters" aria-label="Suodata kalaeriä">
          <input className="consumer-input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Hae kalaa, tuotetta tai kalastajaa" />
          <select className="consumer-input" value={species} onChange={(event) => setSpecies(event.target.value)}>
            <option value="">Kaikki kalalajit</option>
            {speciesOptions.map((item) => <option key={item}>{item}</option>)}
          </select>
          <select className="consumer-input" value={municipality} onChange={(event) => setMunicipality(event.target.value)}>
            <option value="">Kaikki paikkakunnat</option>
            {municipalityOptions.map((item) => <option key={item}>{item}</option>)}
          </select>
        </section>

        <div className="consumer-list-heading"><h2>Myynnissä nyt</h2><div className="consumer-list-controls"><span>{visibleListings.length} kalaerää</span><button type="button" className="consumer-button consumer-refresh" disabled={loading} onClick={onRefresh}>{loading ? "Haetaan…" : "↻ Päivitä"}</button></div></div>
        {loading ? <div className="consumer-empty">Haetaan tuoreita kalaeriä…</div> : null}
        {!loading && visibleListings.length === 0 ? <div className="consumer-empty">Näillä rajauksilla ei löytynyt kalaeriä. Voit tilata ilmoituksen seuraavasta sopivasta erästä.</div> : null}
        <section className="consumer-grid">
          {visibleListings.map((listing) => (
            <article className="consumer-card" key={listing.id}>
              {listing.imageUrl ? <img className="consumer-card-image" src={listing.imageUrl} alt={listing.productName} /> : <FishPlaceholder species={listing.species} />}
              <div className="consumer-card-body">
                <div><h3>{listing.productName}</h3><div className="consumer-small">Yritysmyyjä: {listing.sellerName}{listing.sellerBusinessId ? ` · Y-tunnus ${listing.sellerBusinessId}` : ""}</div></div>
                <div className="consumer-meta"><span className="consumer-pill">{listing.municipality || "Paikkakunta sovitaan"}</span>{listingUnitType(listing) !== "package" ? <span className="consumer-pill">{listingUnitType(listing) === "piece" ? "Rapuja kappaleittain" : "Kokonaisia kaloja"}</span> : null}<span className="consumer-pill">{listing.availableUnits} {listingUnitType(listing) === "piece" ? "kpl" : "jäljellä"}</span></div>
                <div className="consumer-summary" style={{ margin: 0 }}><strong>Noudettavissa {pickupWindow(listing.pickupStart, listing.pickupEnd)}</strong><span>{pickupPlace(listing)}</span><span className="consumer-small">{orderingClosed(listing) ? "Tilausaika on päättynyt" : `Tilaa viimeistään ${dateTime(listing.orderDeadline)}`}</span></div>
                <div className="consumer-description">{listing.description}</div>
                <div className="consumer-price-row">
                  <div className="consumer-price">{money(getStartingPrice(listing))}<small>{listingUnitType(listing) === "piece" ? "sis. ALV / kpl alkaen" : listingUnitType(listing) === "whole_fish" ? "sis. ALV / kg alkaen" : "sis. ALV / pakkaus alkaen"}</small></div>
                  <button className="consumer-button consumer-primary" disabled={orderingClosed(listing)} onClick={() => openListing(listing)}>{orderingClosed(listing) ? "Tilausaika päättynyt" : "Varaa"}</button>
                </div>
              </div>
            </article>
          ))}
        </section>

        {soldListings.length > 0 ? (
          <section className="consumer-sold-section" aria-label="Myydyt kalaerät">
            <button type="button" className="consumer-sold-toggle" aria-expanded={soldOpen} onClick={() => setSoldOpen((current) => !current)}>
              <strong>Myydyt</strong>
              <span>{soldListings.length} {soldListings.length === 1 ? "erä" : "erää"} {soldOpen ? "▲" : "▼"}</span>
            </button>
            {soldOpen ? (
              <div className="consumer-grid consumer-sold-grid">
                {soldListings.map((listing) => (
                  <article className="consumer-card consumer-card-sold" key={listing.id}>
                    {listing.imageUrl ? <img className="consumer-card-image" src={listing.imageUrl} alt={listing.productName} /> : <FishPlaceholder species={listing.species} />}
                    <div className="consumer-card-body">
                      <div><h3>{listing.productName}</h3><div className="consumer-small">Yritysmyyjä: {listing.sellerName}</div></div>
                      <div className="consumer-meta"><span className="consumer-pill">{listing.municipality || "Paikkakunta ei tiedossa"}</span></div>
                      <span className="consumer-sold-badge">Myyty loppuun</span>
                      <div className="consumer-price">{money(getStartingPrice(listing))}<small>{listingUnitType(listing) === "piece" ? "sis. ALV / kpl" : listingUnitType(listing) === "whole_fish" ? "sis. ALV / kg" : "sis. ALV / pakkaus"}</small></div>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {user ? (
          <section className="consumer-orders">
            <div className="consumer-list-heading"><h2>Omat varaukset</h2><span>{groupedOrders.length}</span></div>
            {groupedOrders.length === 0 ? <div className="consumer-empty">Sinulla ei ole vielä varauksia.</div> : (
              <div className="consumer-orders-grid">
                {groupedOrders.map((group) => {
                  const status = group.orders.every((order) => order.status === "collected") ? "Noudettu" : group.orders.every((order) => order.status === "cancelled") ? "Peruttu" : "Varattu";
                  const total = group.orders.reduce((sum, order) => sum + Number(order.total_including_vat || 0), 0);
                  return (
                    <article className="consumer-order-card" key={group.id}>
                      <div className="consumer-order-head"><strong>VARAUS {String(group.id).slice(0, 8).toUpperCase()}</strong><span className="consumer-order-status">{status}</span></div>
                      <div className="consumer-order-body">
                        <div className="consumer-order-product">
                          <div><h3>{group.first.product_name || group.first.species || "Kalaerä"}</h3><div className="consumer-order-lines">{group.orders.map((order) => <span key={order.id}>{order.unit_count || order.package_count} × {order.variant_label || (order.sale_unit_type === "piece" ? "rapu" : order.sale_unit_type === "whole_fish" ? "kokonainen kala" : "pakkaus")}</span>)}</div></div>
                          <div className="consumer-order-price">{money(total)}</div>
                        </div>
                        <div className="consumer-order-pickup">
                          <div><div className="consumer-order-pickup-label">Noutoaika</div><strong className="consumer-order-pickup-time">{pickupWindow(group.first.pickup_start, group.first.pickup_end)}</strong></div>
                          <div><div className="consumer-order-pickup-label">Noutopaikka</div><div className="consumer-order-location"><span aria-hidden="true">📍</span><span>{group.first.pickup_location || group.first.municipality || "Noutopaikka vahvistetaan"}</span></div></div>
                        </div>
                        <div className="consumer-order-footer"><span>Maksutavat: <strong>{formatConsumerPaymentMethods(group.first.payment_methods)}</strong></span>{group.first.seller_name ? <span>Myyjä: <strong>{group.first.seller_name}</strong></span> : null}</div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        ) : null}
      </main>

      {accountOpen && user ? (
        <div className="consumer-overlay" role="dialog" aria-modal="true" aria-label="Omat tiedot" onMouseDown={(event) => { if (event.target === event.currentTarget) setAccountOpen(false); }}>
          <form className="consumer-dialog consumer-form" onSubmit={async (event) => { event.preventDefault(); const ok = await onSaveOwnDetails(accountForm); if (ok) setAccountOpen(false); }}>
            <div className="consumer-dialog-head"><div><div className="consumer-kicker">Kuluttajatili</div><h2>Omat tiedot</h2></div><button type="button" className="consumer-close" onClick={() => setAccountOpen(false)} aria-label="Sulje">×</button></div>
            <div className="consumer-field"><label>Nimi</label><input className="consumer-input" autoComplete="name" required value={accountForm.displayName} onChange={(event) => setAccountForm((current) => ({ ...current, displayName: event.target.value }))} /></div>
            <div className="consumer-field"><label>Sähköposti</label><input className="consumer-input" type="email" value={user.email || ""} readOnly /></div>
            <div className="consumer-small">Sähköpostiosoite on kirjautumistunnuksesi. Sen vaihtamiseen ota yhteyttä Suoraan Kalastajalta -palveluun.</div>
            <div className="consumer-field"><label>Puhelinnumero (vapaaehtoinen)</label><input className="consumer-input" type="tel" autoComplete="tel" value={accountForm.phone} onChange={(event) => setAccountForm((current) => ({ ...current, phone: event.target.value }))} placeholder="040 123 4567" /></div>
            <button className="consumer-button consumer-primary" disabled={busy}>{busy ? "Tallennetaan…" : "Tallenna tiedot"}</button>
            <details className="consumer-account-danger">
              <summary>Tilin hallinta</summary>
              <div className="consumer-account-danger-content">
                <div className="consumer-small">Käyttäjätilin poistaminen on pysyvä toiminto. Sinulta pyydetään vielä kaksi vahvistusta ennen poistamista.</div>
                <button type="button" className="consumer-button consumer-account-delete" disabled={busy} onClick={async () => { const ok = await onDeleteOwnAccount(); if (ok) setAccountOpen(false); }}>Poista käyttäjätili pysyvästi</button>
              </div>
            </details>
          </form>
        </div>
      ) : null}

      {selected ? (
        <div className="consumer-overlay" role="dialog" aria-modal="true" aria-label="Varaa kalaerä" onMouseDown={(event) => { if (event.target === event.currentTarget) closeListing(); }}>
          <div className="consumer-dialog">
            <div className="consumer-dialog-head"><div><div className="consumer-kicker">Varaa noudettavaksi</div><h2>{selected.productName}</h2></div><button className="consumer-close" onClick={closeListing} aria-label="Sulje">×</button></div>
            <div className="consumer-summary">
              <span><strong>Myyjä:</strong> {selected.sellerName} (elinkeinonharjoittaja)</span>
              {selected.sellerBusinessId ? <span><strong>Y-tunnus:</strong> {selected.sellerBusinessId}</span> : null}
              {selected.sellerAddress || selected.sellerCity ? <span><strong>Osoite:</strong> {[selected.sellerAddress, [selected.sellerPostcode, selected.sellerCity].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</span> : null}
              {selected.sellerEmail ? <span><strong>Sähköposti:</strong> <a href={`mailto:${selected.sellerEmail}`}>{selected.sellerEmail}</a></span> : null}
              {selected.sellerPhone ? <span><strong>Puhelin:</strong> <a href={`tel:${selected.sellerPhone}`}>{selected.sellerPhone}</a></span> : null}
              <span><strong>Nouto:</strong> {pickupPlace(selected)}</span><span><strong>Noudettavissa:</strong> {pickupWindow(selected.pickupStart, selected.pickupEnd)}</span><span><strong>Tilaa viimeistään:</strong> {dateTime(selected.orderDeadline)}</span><span><strong>Maksutavat:</strong> {formatConsumerPaymentMethods(selected.paymentMethods)}</span><span><strong>Erätunnus:</strong> {selected.batchId}</span>
            </div>
            <div className="consumer-form">
              <a className="consumer-button" href={getConsumerAppDeepLink(selected.id)} style={{ textAlign: "center", textDecoration: "none" }}>Avaa Suoraan Kalastajalta -sovelluksessa</a>
              <div className="consumer-field">
                <label>Valitse haluamasi määrät</label>
                <div className="consumer-variant-list">
                  {selected.variants.filter((variant) => variant.availableUnits > 0).map((variant) => (
                    <div className="consumer-variant-row" key={variant.id}>
                      <div>
                        {variant.unitType === "piece" ? <><strong>{variant.label || "Rapu"}</strong><span className="consumer-variant-price">Hinta: {money(variant.unitPrice)} / kpl</span></> : <strong>{variantOptionLabel(variant)}</strong>}
                        <span className="consumer-small">Saatavilla {variant.availableUnits} {reservationUnitLabel(variant)}</span>
                      </div>
                      <label className="consumer-quantity-field">
                        <span>Määrä ({reservationUnitLabel(variant)})</span>
                        <span className="consumer-quantity-input">
                          <input
                            className="consumer-input"
                            type="number"
                            inputMode="numeric"
                            min="0"
                            max={variant.availableUnits}
                            step="1"
                            value={variantQuantities[variant.id] ?? ""}
                            placeholder="0"
                            aria-label={`${variant.label || "Tuote"}, määrä ${reservationUnitLabel(variant)}`}
                            onChange={(event) => {
                              const value = normalizeConsumerQuantityInput(event.target.value, variant.availableUnits);
                              setVariantQuantities((current) => ({ ...current, [variant.id]: value }));
                              setReservationError("");
                            }}
                          />
                          <span>{reservationUnitLabel(variant)}</span>
                        </span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="consumer-field"><label>Varaajan nimi</label><input className="consumer-input" autoComplete="name" value={customerName} onChange={(event) => { setCustomerName(event.target.value); setReservationError(""); }} placeholder="Etunimi ja sukunimi" /></div>
              <div className="consumer-field"><label>Sähköposti varausvahvistusta varten</label><input className="consumer-input" type="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setReservationError(""); }} placeholder="nimi@esimerkki.fi" /></div>
              <div className="consumer-field"><label>Puhelinnumero noutoa varten</label><input className="consumer-input" type="tel" value={phone} onChange={(event) => { setPhone(event.target.value); setReservationError(""); }} placeholder="040 123 4567" /></div>
              <div className="consumer-field"><label>Viesti kalastajalle (valinnainen)</label><textarea className="consumer-input" rows="3" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Esimerkiksi arvioitu noutoaika" /></div>
              {totals?.lines.length ? <div className="consumer-summary">{totals.lines.map((line) => <span key={line.variant.id}><strong>{line.unitCount} ×</strong> {variantOptionLabel(line.variant)} · {money(line.grossTotal)}</span>)}{totals.lines.every((line) => line.variant.unitType === "piece") ? <span><strong>Yhteensä:</strong> {totals.totalUnits} rapua</span> : <span><strong>Yhteispaino:</strong> {totals.isEstimate ? "noin " : ""}{quantity(totals.estimatedWeightKg)} kg</span>}{totals.isEstimate ? <span>Lopullinen paino ja hinta vahvistetaan punnituksen jälkeen.</span> : null}</div> : <div className="consumer-small">Syötä määrä vähintään yhdelle myyntivaihtoehdolle.</div>}
              <div className="consumer-total"><span>{totals?.isEstimate ? "Arviohinta" : "Yhteensä"}</span><span>{money(totals?.grossTotal)}</span></div>
              <div className="consumer-notice"><strong>Maksutavat:</strong> {formatConsumerPaymentMethods(selected.paymentMethods)}. Maksu suoritetaan suoraan kalastajalle.</div>
              <div className="consumer-small">Hinta sisältää arvonlisäveron. Varaus vähentää kaikkien valittujen pakkaus-, kala- tai rapukokoluokkien saldoa. Varaaminen ei vaadi kirjautumista.</div>
              <label className="consumer-small" style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <input type="checkbox" checked={acceptedTerms} onChange={(event) => { setAcceptedTerms(event.target.checked); setReservationError(""); }} />
                <span>Hyväksyn <a href={LEGAL_TERMS_URL} target="_blank" rel="noreferrer">kuluttajamyynnin käyttöehdot</a>. Olen tutustunut samalla sivulla olevaan tietosuojaselosteeseen, jossa kerrotaan varauksen yhteydessä kerättävien tietojen käsittelystä ja luovuttamisesta kalastajalle.</span>
              </label>
              <div className="consumer-submit-bar">
                {reservationError ? <div className="consumer-form-error" role="alert">{reservationError}</div> : null}
                <button type="button" className="consumer-button consumer-primary" disabled={busy || orderingClosed(selected)} onClick={submitReservation}>{orderingClosed(selected) ? "Tilausaika on päättynyt" : busy ? "Varataan…" : "Varaa ja sitoudu maksamaan"}</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {alertsOpen ? (
        <div className="consumer-overlay" role="dialog" aria-modal="true" aria-label="Kalaeräilmoitukset" onMouseDown={(event) => { if (event.target === event.currentTarget) setAlertsOpen(false); }}>
          <div className="consumer-dialog">
            <div className="consumer-dialog-head"><div><div className="consumer-kicker">Pysy ajan tasalla</div><h2>Ilmoita uusista kalaeristä</h2></div><button className="consumer-close" onClick={() => setAlertsOpen(false)} aria-label="Sulje">×</button></div>
            <p className="consumer-description">Valitse kala ja paikkakunta. Tilaamalla annat vapaaehtoisen suostumuksen saada uusien kalaerien markkinointi-ilmoituksia sähköpostilla ja sovelluksessa myös push-ilmoituksina, jos push-ilmoitukset ovat käytössä. Voit perua suostumuksen milloin tahansa tästä näkymästä tai sähköpostiviestin lopetusohjeella.</p>
            <div className="consumer-form">
              {user ? (
                <div className="consumer-alert-saved">
                  <div className="consumer-alert-saved-head"><strong>Tallennetut ilmoitukset</strong><span className="consumer-alert-count">{alertSubscriptions.length}</span></div>
                  {alertSubscriptions.length > 0 ? (
                    <div className="consumer-alert-saved-list">
                      {alertSubscriptions.map((subscription) => (
                        <div className="consumer-alert-saved-item" key={subscription.id}>
                          <span>🐟 {subscription.species || "Kaikki kalalajit"}</span>
                          <span>📍 {subscription.municipality || "Kaikki paikkakunnat"}</span>
                        </div>
                      ))}
                    </div>
                  ) : <div className="consumer-small">Sinulla ei ole aktiivisia kalaeräilmoituksia.</div>}
                </div>
              ) : null}
              <div className="consumer-field"><label>Kalalaji</label><select className="consumer-input" value={alertSpecies} onChange={(event) => setAlertSpecies(event.target.value)}><option value="">Kaikki kalalajit</option>{speciesOptions.map((item) => <option key={item}>{item}</option>)}</select></div>
              <div className="consumer-field"><label>Paikkakunta</label><select className="consumer-input" value={alertMunicipality} onChange={(event) => setAlertMunicipality(event.target.value)}><option value="">Kaikki paikkakunnat</option>{municipalityOptions.map((item) => <option key={item}>{item}</option>)}</select></div>
              <button className="consumer-button consumer-primary" disabled={busy} onClick={async () => { if (!user) { setAlertsOpen(false); onOpenAuth({ subscribe: { species: alertSpecies, municipality: alertMunicipality } }); return; } const ok = await onSubscribe({ species: alertSpecies, municipality: alertMunicipality }); if (ok) setAlertsOpen(false); }}>{user ? "Tallenna ilmoitus" : "Kirjaudu tilaamaan ilmoitus"}</button>
              {user ? <button className="consumer-button" disabled={busy} onClick={async () => { const ok = await onUnsubscribe(); if (ok) setAlertsOpen(false); }}>Lopeta kaikki kalaeräilmoitukset</button> : null}
              <div className="consumer-small">Suostumuksen antaminen tai peruuttaminen ei vaikuta kuluttajatilin tai varauspalvelun käyttöön. Katso lisätiedot <a href={LEGAL_TERMS_URL} target="_blank" rel="noreferrer">tietosuojaselosteesta</a>.</div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
