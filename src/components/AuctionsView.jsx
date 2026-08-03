import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { invokeEdgeFunctionAuthenticated } from "../services/edgeFunctions.js";
import {
  ALLOWED_AUCTION_IMAGE_TYPES,
  prepareAuctionImage,
} from "../lib/auctionImage.js";
import {
  FISH_PACKAGING_OPTIONS,
  extractPackagingFromNotes,
  removePackagingFromNotes,
} from "../lib/packaging.js";
import {
  AUCTION_DURATION_OPTIONS,
  AUCTION_EXTENSION_MINUTES,
  auctionStatusLabel,
  extractAuctionAdditionalNotes,
  formatAuctionRemaining,
  getAuctionRemainingMs,
  minimumNextBid,
  normalizeAuctionMoney,
  validateAuctionDraft,
} from "../lib/auctionLogic.js";
import {
  getMissingBuyerPurchaseFields,
  getMissingSellerSaleFields,
} from "../lib/tradeProfile.js";

const panel = { background: "#fff", border: "1px solid #dbe4ee", borderRadius: 18, padding: 18, boxShadow: "0 8px 24px rgba(15,23,42,0.05)" };
const field = { display: "flex", flexDirection: "column", gap: 6 };
const input = { width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 10, padding: "11px 12px", fontSize: 16, background: "#fff" };
const button = { border: "1px solid #93c5fd", borderRadius: 10, padding: "10px 14px", background: "#eff6ff", color: "#1d4ed8", fontWeight: 750, cursor: "pointer" };
const primaryButton = { ...button, background: "#2563eb", borderColor: "#2563eb", color: "#fff" };
const badge = { display: "inline-flex", borderRadius: 999, padding: "5px 9px", background: "#eef2ff", color: "#3730a3", fontSize: 13, fontWeight: 750 };
const AUCTION_IMAGE_BUCKET = "auction-images";

function isTransientNetworkError(error) {
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
    message.includes("dns")
  );
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function euro(value) {
  return `${Number(value || 0).toLocaleString("fi-FI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function addressLine(address, postcode, city) {
  return [address, [postcode, city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

function getBatchQrImageUrl(batchId) {
  if (!batchId) return "";
  const appBaseUrl = typeof window !== "undefined" ? String(window.location.origin || "").replace(/\/$/, "") : "";
  const traceUrl = `${appBaseUrl}/?batch=${encodeURIComponent(batchId)}`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=160x160&format=png&qzone=1&data=${encodeURIComponent(traceUrl)}&cache=${encodeURIComponent(batchId)}`;
}

function fulfillmentStatusLabel(status) {
  if (status === "delivery_agreed") return "Toimitus sovittu";
  if (status === "delivered" || status === "received") return "Vastaanotettu";
  return "Odottaa toimitusta";
}

function isCrayfishLabel(label) {
  const normalized = String(label || "").toLocaleLowerCase("fi-FI");
  return normalized.includes("täplärapu") || normalized.includes("jokirapu") || normalized.includes("pacifastacus leniusculus") || normalized.includes("astacus astacus");
}

function auctionUnit(auction) {
  return auction?.quantity_unit === "kpl" || isCrayfishLabel(auction?.species) ? "kpl" : "kg";
}

function auctionQuantity(auction) {
  return Number(auction?.total_quantity ?? auction?.total_kilos ?? 0);
}

function pickupCityFromAuction(auction) {
  const deliveryArea = String(auction?.delivery_area || "").trim();
  if (deliveryArea) {
    const lastPart = deliveryArea.split(",").map((part) => part.trim()).filter(Boolean).at(-1) || "";
    const withoutPostcode = lastPart.replace(/^\d{5}\s+/, "").trim();
    if (withoutPostcode && !/^\d{5}$/.test(withoutPostcode)) return withoutPostcode;
  }
  return String(auction?.municipality || auction?.area || "").trim();
}

function auctionDeliveryLabel(auction) {
  const method = String(auction?.delivery_method || "Nouto").trim() || "Nouto";
  if (method.toLocaleLowerCase("fi-FI") === "nouto") {
    const pickupCity = pickupCityFromAuction(auction);
    return pickupCity ? `Nouto · ${pickupCity}` : "Nouto";
  }
  return `${method}${auction?.delivery_area ? ` · ${auction.delivery_area}` : ""}`;
}

function formatAuctionDeliveryDate(value) {
  const date = String(value || "").trim();
  if (!date) return "";
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString("fi-FI");
}

function hasAuctionDeliveryCost(auction) {
  return auction?.delivery_cost !== null && auction?.delivery_cost !== undefined && String(auction.delivery_cost).trim() !== "";
}

function auctionImageUrl(imagePath) {
  if (!imagePath) return "";
  return supabase.storage.from(AUCTION_IMAGE_BUCKET).getPublicUrl(imagePath).data.publicUrl;
}

function AuctionCard({ auction, tradeOffer, isBuyer, onBid, onReceive, onCreateDeliveryNote, busy, isFocused }) {
  const [bid, setBid] = useState("");
  const remaining = getAuctionRemainingMs(auction);
  const nextBid = minimumNextBid(auction);
  const open = auction.status === "open" && remaining > 0;
  const awaitingFinalization = auction.status === "open" && remaining <= 0;
  const packaging = extractPackagingFromNotes(auction.notes);
  const additionalNotes = removePackagingFromNotes(extractAuctionAdditionalNotes(auction.notes));
  const unit = auctionUnit(auction);
  const quantity = auctionQuantity(auction);
  const buyerLostAuction = isBuyer && auction.status === "sold" && !auction.my_is_winner;
  const reserveNotMetForLeadingBuyer = isBuyer && auction.status === "unsold" && auction.my_is_leading && !auction.reserve_met;
  const statusBadgeStyle = open
    ? { ...badge, minWidth: 104, minHeight: 32, alignItems: "center", justifyContent: "center", textAlign: "center", background: "#dcfce7", border: "1px solid #22c55e", color: "#166534" }
    : buyerLostAuction || reserveNotMetForLeadingBuyer
      ? { ...badge, minWidth: 104, minHeight: 32, alignItems: "center", justifyContent: "center", textAlign: "center", background: "#fee2e2", border: "1px solid #f87171", color: "#991b1b" }
    : { ...badge, minWidth: 104, minHeight: 32, alignItems: "center", justifyContent: "center", textAlign: "center" };

  useEffect(() => {
    if (isBuyer && open) setBid(String(nextBid).replace(".", ","));
  }, [auction.id, isBuyer, nextBid, open]);

  return (
    <div id={`auction-card-${auction.id}`} style={{ ...panel, display: "flex", flexDirection: "column", gap: 12, ...(isFocused ? { border: "2px solid #2563eb", boxShadow: "0 0 0 4px rgba(37, 99, 235, 0.16), 0 10px 28px rgba(15,23,42,0.10)" } : {}) }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 850, color: "#0f172a" }}>{auction.species || "Kalaerä"}</div>
          <div style={{ color: "#0f172a", marginTop: 5, fontSize: 24, lineHeight: 1.15, fontWeight: 850 }}>
            {quantity.toLocaleString("fi-FI")} {unit}
          </div>
          <div style={{ color: "#475569", marginTop: 3, fontSize: 15 }}>
            {auction.area || "-"}{auction.municipality ? ` / ${auction.municipality}` : ""}
          </div>
        </div>
        <span style={statusBadgeStyle}>{awaitingFinalization || buyerLostAuction ? "Päättynyt" : auctionStatusLabel(auction.status)}</span>
      </div>
      {auction.image_path ? (
        <img
          src={auctionImageUrl(auction.image_path)}
          alt={`${auction.species || "Kalaerä"} huutokaupassa`}
          loading="lazy"
          style={{ display: "block", width: "100%", maxHeight: 380, objectFit: "cover", borderRadius: 14, border: "1px solid #e2e8f0", background: "#f8fafc" }}
        />
      ) : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 10 }}>
        <div><div style={{ color: "#64748b", fontSize: 13 }}>Korkein huuto (ALV 0 %)</div><strong style={{ fontSize: 20 }}>{euro(auction.current_price_per_kg)} / {unit}</strong></div>
        <div><div style={{ color: "#64748b", fontSize: 13 }}>Erän tämänhetkinen arvo (ALV 0 %)</div><strong style={{ fontSize: 20 }}>{euro(Number(auction.current_price_per_kg || 0) * quantity)}</strong></div>
        <div><div style={{ color: "#64748b", fontSize: 13 }}>Huutoja</div><strong style={{ fontSize: 20 }}>{auction.bid_count || 0}</strong></div>
        <div><div style={{ color: "#64748b", fontSize: 13 }}>{open ? "Aikaa jäljellä" : "Päättynyt"}</div><strong style={{ fontSize: 20 }}>{open ? formatAuctionRemaining(remaining) : new Date(auction.effective_end_at || auction.ends_at).toLocaleString("fi-FI")}</strong></div>
      </div>
      <div style={{ color: "#475569", fontSize: 14 }}>Erätunnus: {auction.batch_id || "-"} · Pyyntipäivä: {auction.catch_date || "-"} · Pyydys: {auction.gear || "-"}</div>
      {packaging ? <div style={{ color: "#334155", fontSize: 15 }}><strong>Pakkaustapa:</strong> {packaging}</div> : null}
      <div style={{ color: "#475569", fontSize: 14 }}><strong>Toimitus:</strong> {auctionDeliveryLabel(auction)}</div>
      {auction.earliest_delivery_date ? <div style={{ color: "#475569", fontSize: 14 }}><strong>Aikaisin toimituspäivä:</strong> {formatAuctionDeliveryDate(auction.earliest_delivery_date)}</div> : null}
      {hasAuctionDeliveryCost(auction) ? <div style={{ color: "#475569", fontSize: 14 }}><strong>Toimituksen hinta:</strong> {euro(auction.delivery_cost)}</div> : null}
      {additionalNotes ? (
        <div style={{ padding: 12, borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0", color: "#334155", fontSize: 14 }}>
          <strong>Lisätiedot:</strong>
          <div style={{ marginTop: 5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{additionalNotes}</div>
        </div>
      ) : null}
      {open && auction.my_is_leading ? <div style={{ padding: 10, borderRadius: 10, background: "#dcfce7", color: "#166534", fontWeight: 750 }}>Olet tällä hetkellä johdossa.</div> : null}
      {auction.status === "sold" ? (
        <div style={{ padding: 10, borderRadius: 10, background: buyerLostAuction ? "#fef2f2" : "#ecfdf5", border: buyerLostAuction ? "1px solid #fecaca" : "none", color: buyerLostAuction ? "#b91c1c" : "#166534" }}>
          {auction.my_is_winner
            ? "Voitit huutokaupan. Kalastajan yhteystiedot näkyvät alla."
            : buyerLostAuction
              ? "Huutokauppa on päättynyt. Et voittanut tätä huutokauppaa."
              : "Huutokauppa päättyi kauppaan. Voittaja ja toimitustiedot näkyvät alla."}
        </div>
      ) : null}
      {reserveNotMetForLeadingBuyer ? (
        <div style={{ padding: 12, borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontWeight: 700 }}>
          Huutokauppa päättyi ilman kauppaa. Korkein huutosi ei saavuttanut myyjän asettamaa pohjahintaa, joten kalaerää ei myyty.
        </div>
      ) : null}
      {auction.status === "sold" && auction.winner_details ? (
        <div style={{ padding: 14, borderRadius: 12, background: "#f8fafc", border: "1px solid #cbd5e1", display: "flex", flexDirection: "column", gap: 5, color: "#334155" }}>
          <strong style={{ color: "#0f172a" }}>Huutokaupan voittaja</strong>
          <div>Yritys: {auction.winner_details.company_name || "-"}</div>
          <div>Yhteyshenkilö: {auction.winner_details.contact_name || "-"}</div>
          <div>Sähköposti: {auction.winner_details.email || "-"}</div>
          <div>Puhelin: {auction.winner_details.phone || "-"}</div>
          {auction.winner_details.business_id ? <div>Y-tunnus: {auction.winner_details.business_id}</div> : null}
          <div><strong>Toimitusosoite:</strong> {addressLine(auction.winner_details.delivery_address, auction.winner_details.delivery_postcode, auction.winner_details.delivery_city) || "-"}</div>
          {!isBuyer ? (
            <>
              <div><strong>Laskutusosoite:</strong> {addressLine(tradeOffer?.buyer_billing_address, tradeOffer?.buyer_billing_postcode, tradeOffer?.buyer_billing_city) || "-"}</div>
              <div><strong>Laskutussähköposti:</strong> {tradeOffer?.buyer_billing_email || "-"}</div>
            </>
          ) : null}
          <div>Toimitustapa: {auctionDeliveryLabel(auction)}</div>
        </div>
      ) : null}
      {auction.status === "sold" && !isBuyer && auction.winner_details ? (
        <div style={{ padding: 14, borderRadius: 12, background: "#eff6ff", border: "1px solid #93c5fd", display: "flex", flexDirection: "column", gap: 10 }}>
          <strong style={{ color: "#0f172a", fontSize: 18 }}>Luo lähetyslista</strong>
          <div style={{ color: "#475569", fontSize: 14 }}>Tulosta täydet jäljitettävyystiedot A4:lle tai osoitetarra MUNBYN-lämpötulostimelle.</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={primaryButton} onClick={() => onCreateDeliveryNote(auction, "a4")}>A4</button>
            <button type="button" style={button} onClick={() => onCreateDeliveryNote(auction, "munbyn_4x3")}>MUNBYN 4×3</button>
            <button type="button" style={button} onClick={() => onCreateDeliveryNote(auction, "munbyn_4x6")}>MUNBYN 4×6</button>
          </div>
        </div>
      ) : null}
      {auction.status === "sold" && auction.my_is_winner && auction.seller_details ? (
        <div style={{ padding: 14, borderRadius: 12, background: "#f8fafc", border: "1px solid #cbd5e1", display: "flex", flexDirection: "column", gap: 5, color: "#334155" }}>
          <strong style={{ color: "#0f172a" }}>Kalastajan tiedot</strong>
          <div>Nimi / yritys: {auction.seller_details.company_name || auction.seller_details.display_name || "-"}</div>
          {auction.seller_details.business_id ? <div>Y-tunnus: {auction.seller_details.business_id}</div> : null}
          <div>Osoite: {addressLine(auction.seller_details.address, auction.seller_details.postcode, auction.seller_details.city) || "-"}</div>
          <div>Sähköposti: {auction.seller_details.contact_email || auction.seller_details.email || "-"}</div>
          <div>Puhelin: {auction.seller_details.phone || "-"}</div>
          {auction.seller_details.commercial_fishing_id ? <div>Kaupallisen kalastajan tunnus: {auction.seller_details.commercial_fishing_id}</div> : null}
        </div>
      ) : null}
      {auction.status === "sold" && auction.my_is_winner ? (
        <div style={{ padding: 14, borderRadius: 12, background: "#eff6ff", border: "1px solid #93c5fd", display: "flex", flexDirection: "column", gap: 10, color: "#334155" }}>
          <strong style={{ color: "#0f172a", fontSize: 18 }}>Vastaanotettava kalaerä</strong>
          <div><strong>Laji:</strong> {auction.species || "-"}</div>
          <div><strong>Määrä:</strong> {quantity.toLocaleString("fi-FI")} {unit}</div>
          <div><strong>Voittanut hinta:</strong> {euro(auction.current_price_per_kg)} / {unit} (ALV 0 %)</div>
          <div><strong>Kaupan arvo:</strong> {euro(Number(auction.current_price_per_kg || 0) * quantity)} (ALV 0 %)</div>
          <div><strong>Erätunnus:</strong> <span style={{ overflowWrap: "anywhere" }}>{auction.batch_id || "-"}</span></div>
          <div><strong>Pyyntipäivä:</strong> {auction.catch_date || "-"}</div>
          <div><strong>Pyyntialue:</strong> {auction.area || "-"}{auction.municipality ? ` / ${auction.municipality}` : ""}{auction.spot ? ` · ${auction.spot}` : ""}</div>
          <div><strong>Pyydys:</strong> {auction.gear || "-"}</div>
          <div><strong>Toimitus:</strong> {auctionDeliveryLabel(auction)}</div>
          {auction.earliest_delivery_date ? <div><strong>Aikaisin toimituspäivä:</strong> {formatAuctionDeliveryDate(auction.earliest_delivery_date)}</div> : null}
          {hasAuctionDeliveryCost(auction) ? <div><strong>Toimituksen hinta:</strong> {euro(auction.delivery_cost)}</div> : null}
          <div><strong>Toimituksen tila:</strong> {fulfillmentStatusLabel(tradeOffer?.fulfillment_status)}</div>
          {additionalNotes ? <div style={{ whiteSpace: "pre-wrap" }}><strong>Lisätiedot:</strong> {additionalNotes}</div> : null}
          {auction.batch_id ? (
            <div style={{ display: "flex", gap: 14, alignItems: "stretch", flexWrap: "wrap" }}>
              <div style={{ padding: 10, borderRadius: 12, background: "#fff", border: "1px solid #bfdbfe", textAlign: "center" }}>
                <img src={getBatchQrImageUrl(auction.batch_id)} alt={`QR ${auction.batch_id}`} style={{ display: "block", width: 132, height: 132 }} />
                <div style={{ marginTop: 5, fontSize: 12, color: "#64748b" }}>QR-koodi erälle</div>
              </div>
              {isBuyer && tradeOffer?.id && !["delivered", "received"].includes(String(tradeOffer.fulfillment_status || "")) ? (
                <button type="button" style={{ ...primaryButton, minWidth: 170, minHeight: 96, whiteSpace: "normal" }} disabled={busy} onClick={() => onReceive(auction, tradeOffer)}>
                  {busy ? "Tallennetaan…" : "Kuittaa erä vastaanotetuksi"}
                </button>
              ) : null}
            </div>
          ) : null}
          {["delivered", "received"].includes(String(tradeOffer?.fulfillment_status || "")) ? (
            <div style={{ padding: 10, borderRadius: 10, background: "#dcfce7", color: "#166534", fontWeight: 750 }}>Kalaerä on kuitattu vastaanotetuksi.</div>
          ) : null}
        </div>
      ) : null}
      {isBuyer && open ? (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
          <label style={{ ...field, flex: "1 1 180px" }}><span>Huutosi ALV 0 % €/{unit} (vähintään {euro(nextBid)})</span><input style={input} inputMode="decimal" value={bid} onChange={(event) => setBid(event.target.value)} /></label>
          <button type="button" style={primaryButton} disabled={busy} onClick={() => onBid(auction, bid)}>{busy ? "Tallennetaan…" : "Tee sitova huuto"}</button>
        </div>
      ) : null}
    </div>
  );
}

export default function AuctionsView({ profile, buyerRecord = null, entries = [], onTradeCreated, notificationTarget = null, onNotificationTargetHandled, onCreateDeliveryNote, onOpenAccountDetails }) {
  const isBuyer = profile?.role === "buyer";
  const canCreate = profile?.role === "member" || profile?.role === "owner";
  const [auctions, setAuctions] = useState([]);
  const [tradeOffersById, setTradeOffersById] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [profileCompletionRequired, setProfileCompletionRequired] = useState(false);
  const [auctionFilter, setAuctionFilter] = useState("all");
  const [focusedAuctionId, setFocusedAuctionId] = useState("");
  const [clock, setClock] = useState(Date.now());
  const [draft, setDraft] = useState({
    entryId: "",
    durationMinutes: 180,
    startingPrice: "",
    minimumIncrement: "0,20",
    reservePrice: "",
    earliestDeliveryDate: "",
    packaging: "",
  });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");

  useEffect(() => () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
  }, [imagePreviewUrl]);

  const availableEntries = useMemo(() => entries.filter((entry) => isCrayfishLabel(entry.species) ? Number(entry.count || 0) > 0 : Number(entry.kilos || 0) > 0), [entries]);
  const selectedEntry = useMemo(() => availableEntries.find((entry) => entry.id === draft.entryId) || null, [availableEntries, draft.entryId]);
  const selectedUnit = isCrayfishLabel(selectedEntry?.species) ? "kpl" : "kg";

  useEffect(() => {
    if (!selectedEntry) return;
    setDraft((current) => ({
      ...current,
      earliestDeliveryDate: selectedEntry.earliestDeliveryDate || "",
      packaging: extractPackagingFromNotes(selectedEntry.notes),
    }));
  }, [selectedEntry]);

  useEffect(() => {
    if (selectedUnit !== "kpl") return;
    setDraft((current) => current.minimumIncrement === "0,05" ? current : { ...current, minimumIncrement: "0,05" });
  }, [selectedUnit]);
  const filteredAuctions = useMemo(() => auctions.filter((auction) => {
    const remaining = getAuctionRemainingMs(auction);
    const isActive = auction.status === "open" && remaining > 0;
    if (auctionFilter === "active") return isActive;
    if (auctionFilter === "won") return auction.status === "sold" && Boolean(auction.my_is_winner);
    if (auctionFilter === "sold") return auction.status === "sold";
    if (auctionFilter === "ended") return !isActive && auction.status !== "scheduled";
    if (auctionFilter === "unsold") return auction.status === "unsold" || auction.status === "cancelled";
    return true;
  }), [auctionFilter, auctions, clock]);

  useEffect(() => {
    if (!focusedAuctionId) return undefined;
    const timer = window.setTimeout(() => setFocusedAuctionId(""), 5000);
    return () => window.clearTimeout(timer);
  }, [focusedAuctionId]);

  useEffect(() => {
    const requestedOfferId = String(notificationTarget?.offerId || "").trim();
    const requestedBatchId = String(notificationTarget?.batchId || "").trim();
    if ((!requestedOfferId && !requestedBatchId) || auctions.length === 0) return undefined;

    const targetAuction = auctions.find((auction) => (
      (requestedOfferId && String(auction.resulting_buyer_offer_id || "") === requestedOfferId) ||
      (requestedBatchId && String(auction.batch_id || "") === requestedBatchId)
    ));
    if (!targetAuction) return undefined;

    setAuctionFilter("all");
    setFocusedAuctionId(String(targetAuction.id));
    const scrollTimer = window.setTimeout(() => {
      document.getElementById(`auction-card-${targetAuction.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      onNotificationTargetHandled?.();
    }, 120);
    return () => {
      window.clearTimeout(scrollTimer);
    };
  }, [auctions, notificationTarget, onNotificationTargetHandled]);

  const loadAuctions = useCallback(async () => {
    let result = await supabase.rpc("list_visible_auctions");
    if (result.error && isTransientNetworkError(result.error)) {
      await wait(1200);
      result = await supabase.rpc("list_visible_auctions");
    }
    const { data, error: loadError } = result;
    if (loadError) {
      // Android voi käynnistyessään olla hetken ilman toimivaa DNS-yhteyttä.
      // Säilytetään edellinen näkymä ja annetaan 15 sekunnin päivityksen yrittää
      // uudelleen sen sijaan, että käyttäjälle näytetään tekninen Supabase-virhe.
      setError(isTransientNetworkError(loadError) ? "" : loadError.message);
    } else {
      const visibleAuctions = Array.isArray(data) ? data : [];
      let tradeOfferLoadError = "";
      setAuctions(visibleAuctions);
      const offerIds = Array.from(new Set(visibleAuctions.map((auction) => auction.resulting_buyer_offer_id).filter(Boolean)));
      if (offerIds.length > 0) {
        let tradeOfferResult = await supabase
          .from("buyer_offers")
          .select("*")
          .in("id", offerIds);
        if (tradeOfferResult.error && isTransientNetworkError(tradeOfferResult.error)) {
          await wait(900);
          tradeOfferResult = await supabase
            .from("buyer_offers")
            .select("*")
            .in("id", offerIds);
        }
        const { data: tradeOffers, error: tradeOfferError } = tradeOfferResult;
        if (tradeOfferError) {
          if (!isTransientNetworkError(tradeOfferError)) {
            tradeOfferLoadError = tradeOfferError.message;
          }
        } else {
          setTradeOffersById(Object.fromEntries((tradeOffers || []).map((offer) => [offer.id, offer])));
        }
      } else {
        setTradeOffersById({});
      }
      setError(tradeOfferLoadError);
    }
    setLoading(false);
  }, []);

  const receiveAuctionTrade = async (auction, tradeOffer) => {
    if (!tradeOffer?.id) {
      setError("Huutokaupasta syntynyttä kauppaa ei löytynyt.");
      return;
    }
    const confirmed = typeof window === "undefined"
      ? true
      : window.confirm("Vahvistatko, että olet vastaanottanut tämän kalaerän?");
    if (!confirmed) return;

    setBusy(true);
    setError("");
    setMessage("");
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token || "";
    const result = await invokeEdgeFunctionAuthenticated("buyer-offer-action", {
      action: "update_fulfillment",
      offerId: tradeOffer.id,
      fulfillmentStatus: "delivered",
    }, accessToken);
    if (result.error) {
      setError(result.error.message || "Erän vastaanottokuittaus epäonnistui.");
    } else {
      setMessage("Kalaerä kuitattiin vastaanotetuksi. Kalastaja voi nyt käsitellä laskun Laskutus-välilehdellä.");
      await loadAuctions();
      onTradeCreated?.();
    }
    setBusy(false);
  };

  useEffect(() => {
    const finalizeAndLoad = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token || "";
      let result = accessToken
        ? await invokeEdgeFunctionAuthenticated("finalize-auctions", {}, accessToken)
        : { data: null, error: { status: 401 } };
      if (result?.error && isTransientNetworkError(result.error)) {
        await wait(1200);
        result = await invokeEdgeFunctionAuthenticated("finalize-auctions", {}, accessToken);
      }
      let finalizedCount = Number(result?.data?.finalizedCount || 0);
      if (result?.error) {
        const fallback = await supabase.rpc("finalize_due_auctions");
        // Viimeistely ajetaan taustalla 15 sekunnin välein. Hetkellinen
        // verkkokatkos ei estä huutokauppojen katselua, joten seuraava ajo yrittää uudelleen.
        if (fallback.error && !isTransientNetworkError(fallback.error)) setError(fallback.error.message);
        finalizedCount = Number(fallback.data || 0);
      }
      await loadAuctions();
      if (finalizedCount > 0) onTradeCreated?.();
    };
    void finalizeAndLoad();
    const refreshId = window.setInterval(() => void finalizeAndLoad(), 15000);
    const clockId = window.setInterval(() => setClock(Date.now()), 1000);
    return () => { window.clearInterval(refreshId); window.clearInterval(clockId); };
  }, [loadAuctions, onTradeCreated]);

  const createAuction = async () => {
    setProfileCompletionRequired(false);
    const missingSellerFields = getMissingSellerSaleFields(profile);
    if (missingSellerFields.length > 0) {
      setProfileCompletionRequired(true);
      setError(`Täytä omat tiedot ennen kuin voit avata huutokaupan. Puuttuu: ${missingSellerFields.join(", ")}.`);
      return;
    }
    const validationError = validateAuctionDraft(draft);
    if (validationError) { setError(validationError); return; }
    if (!draft.earliestDeliveryDate) {
      setError("Valitse aikaisin toimituspäivä.");
      return;
    }
    if (!String(draft.packaging || "").trim()) {
      setError("Valitse, miten huutokaupattava kalaerä on pakattu.");
      return;
    }
    setBusy(true); setError(""); setMessage("");

    const notesWithoutPackaging = removePackagingFromNotes(selectedEntry?.notes);
    const updatedNotes = [
      notesWithoutPackaging,
      `Pakkaustapa: ${String(draft.packaging).trim()}`,
    ].filter(Boolean).join("\n");
    const { error: entryUpdateError } = await supabase
      .from("catch_entries")
      .update({
        earliest_delivery_date: draft.earliestDeliveryDate,
        notes: updatedNotes,
      })
      .eq("id", draft.entryId);
    if (entryUpdateError) {
      setError(`Huutokaupan toimitustietoja ei voitu tallentaa: ${entryUpdateError.message}`);
      setBusy(false);
      return;
    }

    let uploadedImagePath = "";
    if (imageFile) {
      const extension = imageFile.type === "image/png" ? "png" : imageFile.type === "image/webp" ? "webp" : "jpg";
      uploadedImagePath = `${profile.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from(AUCTION_IMAGE_BUCKET).upload(uploadedImagePath, imageFile, {
        cacheControl: "3600",
        contentType: imageFile.type,
        upsert: false,
      });
      if (uploadError) {
        setError(`Kuvan tallennus epäonnistui: ${uploadError.message}`);
        setBusy(false);
        return;
      }
    }
    const { data: auctionId, error: createError } = await supabase.rpc("create_catch_auction", {
      p_entry_id: draft.entryId,
      p_duration_minutes: Number(draft.durationMinutes),
      p_starting_price: normalizeAuctionMoney(draft.startingPrice),
      p_minimum_increment: normalizeAuctionMoney(draft.minimumIncrement),
      p_reserve_price: draft.reservePrice === "" ? null : normalizeAuctionMoney(draft.reservePrice),
    });
    if (createError) {
      if (uploadedImagePath) await supabase.storage.from(AUCTION_IMAGE_BUCKET).remove([uploadedImagePath]);
      setError(createError.message);
    } else {
      if (uploadedImagePath) {
        const { error: attachError } = await supabase.rpc("set_auction_image", { p_auction_id: auctionId, p_image_path: uploadedImagePath });
        if (attachError) {
          await supabase.storage.from(AUCTION_IMAGE_BUCKET).remove([uploadedImagePath]);
          setError(`Huutokauppa avattiin, mutta kuvaa ei voitu liittää: ${attachError.message}`);
          await loadAuctions();
          setBusy(false);
          return;
        }
      }
      setMessage("Huutokauppa avattiin onnistuneesti.");
      setDraft((current) => ({
        ...current,
        entryId: "",
        startingPrice: "",
        reservePrice: "",
        earliestDeliveryDate: "",
        packaging: "",
      }));
      setImageFile(null);
      setImagePreviewUrl("");
      await loadAuctions();
    }
    setBusy(false);
  };

  const selectAuctionImage = async (event) => {
    const selectedFile = event.target.files?.[0] || null;
    event.target.value = "";
    if (!selectedFile) return;
    if (!ALLOWED_AUCTION_IMAGE_TYPES.includes(selectedFile.type)) {
      setError("Valitse JPG-, PNG- tai WebP-kuva.");
      return;
    }
    try {
      setError("");
      const preparedFile = await prepareAuctionImage(selectedFile);
      setImageFile(preparedFile);
      setImagePreviewUrl(URL.createObjectURL(preparedFile));
    } catch (imageError) {
      setError(String(imageError?.message || imageError || "Kuvan käsittely epäonnistui."));
    }
  };

  const placeBid = async (auction, value) => {
    setProfileCompletionRequired(false);
    const missingBuyerFields = getMissingBuyerPurchaseFields(buyerRecord, profile);
    if (missingBuyerFields.length > 0) {
      setProfileCompletionRequired(true);
      setError(`Täytä omat tiedot ennen kuin voit tehdä sitovan huudon. Puuttuu: ${missingBuyerFields.join(", ")}.`);
      return;
    }
    const amount = normalizeAuctionMoney(value);
    if (amount == null || amount < minimumNextBid(auction)) { setError(`Huudon on oltava vähintään ${euro(minimumNextBid(auction))} / kg.`); return; }
    const confirmed = window.confirm(`Vahvistatko sitovan huudon ${euro(amount)} / kg?`);
    if (!confirmed) return;
    setBusy(true); setError(""); setMessage("");
    const { error: bidError } = await supabase.rpc("place_auction_bid", { p_auction_id: auction.id, p_amount_per_kg: amount, p_request_id: crypto.randomUUID() });
    if (bidError) setError(bidError.message);
    else { setMessage(`Huuto ${euro(amount)} / kg hyväksyttiin.`); await loadAuctions(); }
    setBusy(false);
  };

  void clock;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ ...panel, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>Huutokaupat</h2>
          <label style={{ ...field, minWidth: 190 }}>
            <span>Näytä huutokaupat</span>
            <select style={input} value={auctionFilter} onChange={(event) => setAuctionFilter(event.target.value)}>
              <option value="all">Kaikki</option>
              <option value="active">Käynnissä olevat</option>
              {isBuyer ? <option value="won">Voitetut</option> : <option value="sold">Myydyt</option>}
              <option value="ended">Kaikki päättyneet</option>
              <option value="unsold">Myymättä päättyneet</option>
            </select>
          </label>
        </div>
        <p style={{ margin: 0, color: "#475569" }}>Viimeisten {AUCTION_EXTENSION_MINUTES} minuutin aikana hyväksytty huuto siirtää päättymisen aina {AUCTION_EXTENSION_MINUTES} minuutin päähän viimeisestä huudosta.</p>
      </div>
      {error ? (
        <div style={{ padding: 12, borderRadius: 10, background: "#fef2f2", color: "#b91c1c", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
          <div>{error}</div>
          {profileCompletionRequired && onOpenAccountDetails ? (
            <button type="button" style={{ ...primaryButton, background: "#b91c1c", borderColor: "#b91c1c" }} onClick={onOpenAccountDetails}>
              Täydennä omat tiedot
            </button>
          ) : null}
        </div>
      ) : null}
      {message ? <div style={{ padding: 12, borderRadius: 10, background: "#ecfdf5", color: "#166534" }}>{message}</div> : null}
      {canCreate ? (
        <div style={{ ...panel, display: "flex", flexDirection: "column", gap: 14 }}>
          <strong style={{ fontSize: 18 }}>Avaa uusi huutokauppa</strong>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, alignItems: "end" }}>
            <label style={field}><span>Kalaerä</span><select style={input} value={draft.entryId} onChange={(event) => setDraft({ ...draft, entryId: event.target.value })}><option value="">Valitse erä</option>{availableEntries.map((entry) => <option key={entry.id} value={entry.id}>{entry.species} · {isCrayfishLabel(entry.species) ? `${entry.count || 0} kpl` : `${entry.kilos || 0} kg`} · {entry.date}</option>)}</select></label>
            <label style={field}><span>Kesto</span><select style={input} value={draft.durationMinutes} onChange={(event) => setDraft({ ...draft, durationMinutes: Number(event.target.value) })}>{AUCTION_DURATION_OPTIONS.map((option) => <option key={option.minutes} value={option.minutes}>{option.label}</option>)}</select></label>
            <label style={field}><span>Lähtöhinta ALV 0 % €/{selectedUnit}</span><input style={input} inputMode="decimal" value={draft.startingPrice} onChange={(event) => setDraft({ ...draft, startingPrice: event.target.value })} /></label>
            <label style={field}><span>Minimikorotus €/{selectedUnit}</span><input style={input} inputMode="decimal" value={draft.minimumIncrement} onChange={(event) => setDraft({ ...draft, minimumIncrement: event.target.value })} /></label>
            <label style={field}><span>Pohjahinta €/{selectedUnit} (valinnainen)</span><input style={input} inputMode="decimal" value={draft.reservePrice} onChange={(event) => setDraft({ ...draft, reservePrice: event.target.value })} /></label>
            <label style={field}>
              <span>Aikaisin toimituspäivä</span>
              <input
                style={input}
                type="date"
                value={draft.earliestDeliveryDate}
                onChange={(event) => setDraft({ ...draft, earliestDeliveryDate: event.target.value })}
              />
            </label>
            <label style={field}>
              <span>Pakkaustapa</span>
              <select style={input} value={draft.packaging} onChange={(event) => setDraft({ ...draft, packaging: event.target.value })}>
                <option value="">Valitse, miten kalaerä on pakattu</option>
                {FISH_PACKAGING_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          </div>
          <div style={{ ...field, padding: 14, borderRadius: 12, border: "1px solid #bfdbfe", background: "#eff6ff" }}>
            <strong>Huutokaupan kuva (valinnainen)</strong>
            <span style={{ color: "#475569", fontSize: 14 }}>Kuva näkyy ostajille huutokaupan yhteydessä. JPG-, PNG- ja WebP-kuvat pienennetään tarvittaessa automaattisesti.</span>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ ...button, display: "inline-flex", alignItems: "center" }}>
                {imageFile ? "Vaihda kuva" : "Valitse kuva"}
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectAuctionImage} style={{ display: "none" }} />
              </label>
              <label style={{ ...button, display: "inline-flex", alignItems: "center", background: "#ecfdf5", borderColor: "#86efac", color: "#166534" }}>
                Ota kuva
                <input type="file" accept="image/*" capture="environment" onChange={selectAuctionImage} style={{ display: "none" }} />
              </label>
              {imageFile ? <span style={{ color: "#334155", overflowWrap: "anywhere" }}>{imageFile.name}</span> : null}
              {imageFile ? <button type="button" style={{ ...button, color: "#b91c1c", borderColor: "#fecaca", background: "#fff" }} onClick={() => { setImageFile(null); setImagePreviewUrl(""); }}>Poista kuva</button> : null}
            </div>
            {imagePreviewUrl ? <img src={imagePreviewUrl} alt="Huutokauppakuvan esikatselu" style={{ display: "block", width: "100%", maxWidth: 520, maxHeight: 320, objectFit: "cover", borderRadius: 12, border: "1px solid #bfdbfe" }} /> : null}
          </div>
          <div><button type="button" style={primaryButton} disabled={busy || availableEntries.length === 0} onClick={createAuction}>{busy ? "Avataan…" : "Avaa huutokauppa"}</button></div>
        </div>
      ) : null}
      {loading ? <div style={panel}>Ladataan huutokauppoja…</div> : auctions.length === 0 ? <div style={panel}>Ei vielä huutokauppoja.</div> : filteredAuctions.length === 0 ? <div style={panel}>Valitulla suodattimella ei löytynyt huutokauppoja.</div> : filteredAuctions.map((auction) => <AuctionCard key={auction.id} auction={auction} tradeOffer={tradeOffersById[auction.resulting_buyer_offer_id] || null} isBuyer={isBuyer} onBid={placeBid} onReceive={receiveAuctionTrade} onCreateDeliveryNote={onCreateDeliveryNote} busy={busy} isFocused={String(auction.id) === focusedAuctionId} />)}
    </div>
  );
}
