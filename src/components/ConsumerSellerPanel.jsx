import React, { useCallback, useEffect, useState } from "react";
import { Browser } from "@capacitor/browser";
import { supabase } from "../lib/supabase.js";
import { invokeConsumerOrderAction } from "../services/edgeFunctions.js";
import { getConsumerListingUrl } from "../lib/consumerMarketplace.js";
import { DEFAULT_PUBLIC_APP_URL } from "../lib/supabase.js";

const money = (value) => `${Number(value || 0).toLocaleString("fi-FI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const statusLabel = { reserved: "Uusi varaus", confirmed: "Vahvistettu", ready: "Valmis noudettavaksi", collected: "Noudettu", cancelled: "Peruttu", expired: "Vanhentunut" };
const listingStatusLabel = { published: "Myynnissä", paused: "Keskeytetty", sold_out: "Loppuunmyyty", archived: "Arkistoitu", draft: "Luonnos" };
const pickupTime = (start, end) => start ? `${new Date(start).toLocaleString("fi-FI", { dateStyle: "short", timeStyle: "short" })}${end ? `–${new Date(end).toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit" })}` : ""}` : "Noutoaika puuttuu";
const localDateTimeValue = (value) => {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};
const decimalValue = (value) => String(value ?? "").replace(".", ",");
const numericValue = (value) => String(value ?? "").trim().replace(",", ".");

export default function ConsumerSellerPanel({ profile }) {
  const [orders, setOrders] = useState([]);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [finalWeights, setFinalWeights] = useState({});
  const [editingListing, setEditingListing] = useState(null);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    const [ordersResult, listingsResult] = await Promise.all([
      supabase
        .from("consumer_orders")
        .select("id, listing_id, status, consumer_name, consumer_email, consumer_phone, consumer_note, sale_unit_type, variant_label, unit_count, package_count, estimated_weight_kg, final_weight_kg, total_including_vat, commission_amount, commission_status, created_at, consumer_listings(product_name, species, pickup_location, batch_id)")
        .eq("seller_user_id", profile.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("consumer_listings")
        .select("id, product_name, description, species, status, pickup_location, pickup_start, pickup_end, order_deadline, created_at, variants:consumer_listing_variants(id, sale_unit_type, label, package_size_kg, unit_price_including_vat, min_weight_kg, max_weight_kg, price_per_kg_including_vat, available_units, initial_units, sort_order)")
        .eq("seller_user_id", profile.id)
        .order("created_at", { ascending: false }),
    ]);
    setUnavailable(Boolean(ordersResult.error || listingsResult.error));
    setOrders(ordersResult.error ? [] : (ordersResult.data || []).map((order) => ({ ...order, ...(order.consumer_listings || {}) })));
    setListings(listingsResult.error ? [] : (listingsResult.data || []));
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => { void load(); }, [load]);

  const updateStatus = async (order, status) => {
    setBusyId(order.id);
    setMessage("");
    setErrorMessage("");
    const { data: sessionData } = await supabase.auth.getSession();
    const finalWeightKg = status === "collected" && order.sale_unit_type === "whole_fish"
      ? String(finalWeights[order.id] || "").replace(",", ".")
      : null;
    if (status === "collected" && order.sale_unit_type === "whole_fish" && !(Number(finalWeightKg) > 0)) {
      setErrorMessage("Täytä punnittu lopullinen paino ennen kuin merkitset tilauksen noudetuksi.");
      setBusyId("");
      return;
    }
    const result = await invokeConsumerOrderAction(sessionData?.session?.access_token, { action: "seller_update_order", orderId: order.id, status, finalWeightKg });
    if (result.error) setErrorMessage(result.error.message || "Tilauksen päivitys epäonnistui.");
    else { setMessage("Kuluttajatilauksen tila päivitettiin."); await load(); }
    setBusyId("");
  };

  const startEditingListing = (listing) => {
    setMessage("");
    setErrorMessage("");
    setEditingListing({
      id: listing.id,
      productName: listing.product_name || listing.species || "",
      description: listing.description || "",
      pickupLocation: listing.pickup_location || "",
      pickupStart: localDateTimeValue(listing.pickup_start),
      pickupEnd: localDateTimeValue(listing.pickup_end),
      orderDeadline: localDateTimeValue(listing.order_deadline),
      variants: (listing.variants || [])
        .slice()
        .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0))
        .map((variant) => ({
          ...variant,
          label: variant.label || "",
          package_size_kg: decimalValue(variant.package_size_kg),
          unit_price_including_vat: decimalValue(variant.unit_price_including_vat),
          min_weight_kg: decimalValue(variant.min_weight_kg),
          max_weight_kg: decimalValue(variant.max_weight_kg),
          price_per_kg_including_vat: decimalValue(variant.price_per_kg_including_vat),
          available_units: String(variant.available_units ?? 0),
        })),
    });
  };

  const updateEditingVariant = (variantId, field, value) => {
    setEditingListing((current) => current ? ({
      ...current,
      variants: current.variants.map((variant) => variant.id === variantId ? { ...variant, [field]: value } : variant),
    }) : current);
  };

  const saveListing = async (event) => {
    event.preventDefault();
    if (!editingListing) return;
    setBusyId(editingListing.id);
    setMessage("");
    setErrorMessage("");
    const pickupStart = new Date(editingListing.pickupStart);
    const pickupEnd = new Date(editingListing.pickupEnd);
    const orderDeadline = new Date(editingListing.orderDeadline);
    if ([pickupStart, pickupEnd, orderDeadline].some((date) => Number.isNaN(date.getTime()))) {
      setErrorMessage("Tarkista noutoajat ja tilausten määräaika.");
      setBusyId("");
      return;
    }
    const variants = editingListing.variants.map((variant) => ({
      id: variant.id,
      sale_unit_type: variant.sale_unit_type,
      label: String(variant.label || "").trim(),
      package_size_kg: variant.sale_unit_type === "package" ? numericValue(variant.package_size_kg) : null,
      unit_price_including_vat: variant.sale_unit_type === "package" ? numericValue(variant.unit_price_including_vat) : null,
      min_weight_kg: variant.sale_unit_type === "whole_fish" ? numericValue(variant.min_weight_kg) : null,
      max_weight_kg: variant.sale_unit_type === "whole_fish" ? numericValue(variant.max_weight_kg) : null,
      price_per_kg_including_vat: variant.sale_unit_type === "whole_fish" ? numericValue(variant.price_per_kg_including_vat) : null,
      available_units: Number(variant.available_units),
    }));
    const { error } = await supabase.rpc("update_consumer_listing", {
      p_listing_id: editingListing.id,
      p_product_name: editingListing.productName,
      p_description: editingListing.description,
      p_pickup_location: editingListing.pickupLocation,
      p_pickup_start: pickupStart.toISOString(),
      p_pickup_end: pickupEnd.toISOString(),
      p_order_deadline: orderDeadline.toISOString(),
      p_variants: variants,
    });
    if (error) {
      setErrorMessage(error.message || "Kuluttajaerän muokkaus epäonnistui.");
    } else {
      setEditingListing(null);
      setMessage("Kuluttajaerän tiedot päivitettiin.");
      await load();
    }
    setBusyId("");
  };

  const setListingSaleStatus = async (listing, nextStatus) => {
    setBusyId(listing.id);
    setMessage("");
    setErrorMessage("");
    const { error } = await supabase.rpc("set_consumer_listing_status", {
      p_listing_id: listing.id,
      p_status: nextStatus,
    });
    if (error) setErrorMessage(error.message || "Kuluttajaerän myyntitilan muuttaminen epäonnistui.");
    else {
      setMessage(nextStatus === "paused" ? "Kuluttajaerän myynti keskeytettiin." : "Kuluttajaerä palautettiin myyntiin.");
      await load();
    }
    setBusyId("");
  };

  const renderOrderCard = (order) => {
    const unitCount = Number(order.unit_count || order.package_count || 0);
    const unitLabel = order.variant_label || (order.sale_unit_type === "whole_fish" ? "kokonainen kala" : "pakkaus");
    return (
      <div key={order.id} style={{ border: "1px solid #86cfa5", borderRadius: 14, padding: 14, background: "#fbfffc", display: "grid", gap: 11 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
          <div>
            <div style={{ color: "#47705c", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em" }}>Tilattu tuote</div>
            <strong style={{ display: "block", marginTop: 3, fontSize: 18 }}>{order.product_name || order.species || "Kalaerä"}</strong>
            <div style={{ marginTop: 4, fontSize: 17, fontWeight: 800 }}>{unitCount} × {unitLabel}</div>
          </div>
          <span style={{ borderRadius: 999, padding: "6px 10px", background: "#dcfce7", color: "#166534", fontSize: 13, fontWeight: 800 }}>{statusLabel[order.status] || order.status}</span>
        </div>
        <div style={{ border: "1px solid #d3e8dc", borderRadius: 12, padding: 12, background: "#f0fdf4" }}>
          <div style={{ color: "#47705c", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em" }}>Tilaaja</div>
          <strong style={{ display: "block", marginTop: 3, fontSize: 18 }}>{order.consumer_name || "Nimi puuttuu"}</strong>
          <div style={{ marginTop: 4, color: "#315b4a", fontWeight: 650 }}>{order.consumer_phone || "Puhelinnumero puuttuu"}</div>
          <div style={{ marginTop: 2, color: "#526b60", overflowWrap: "anywhere" }}>{order.consumer_email || "Sähköposti puuttuu"}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", color: "#315b4a" }}><span><strong>Tilauksen arvo:</strong> {money(order.total_including_vat)}</span><span>{order.pickup_location || "Noutopaikka puuttuu"}</span></div>
        {order.sale_unit_type === "whole_fish" && order.estimated_weight_kg ? <div style={{ color: "#526b60" }}>Arvioitu paino {Number(order.estimated_weight_kg).toLocaleString("fi-FI")} kg · lopullinen paino vahvistetaan noudettaessa</div> : null}
        {order.sale_unit_type === "whole_fish" && order.status === "ready" ? (
          <label style={{ display: "grid", gap: 5, maxWidth: 260 }}>
            <span>Punnittu lopullinen paino (kg)</span>
            <input inputMode="decimal" value={finalWeights[order.id] || ""} onChange={(event) => setFinalWeights((current) => ({ ...current, [order.id]: event.target.value }))} placeholder="Esim. 2,65" />
          </label>
        ) : null}
        {order.sale_unit_type === "whole_fish" && order.final_weight_kg ? <div style={{ color: "#526b60" }}>Lopullinen paino {Number(order.final_weight_kg).toLocaleString("fi-FI")} kg</div> : null}
        {order.consumer_note ? <div style={{ borderLeft: "3px solid #86efac", paddingLeft: 10, color: "#526b60" }}><strong>Viesti:</strong> {order.consumer_note}</div> : null}
        <div style={{ color: "#526b60", fontSize: 13 }}>Palvelukomissio: {money(order.commission_amount)} · {order.commission_status === "unbilled" ? "laskuttamatta" : order.commission_status}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {order.status === "reserved" ? <button disabled={busyId === order.id} onClick={() => updateStatus(order, "confirmed")}>Vahvista varaus</button> : null}
          {["confirmed", "reserved"].includes(order.status) ? <button disabled={busyId === order.id} onClick={() => updateStatus(order, "ready")}>Merkitse noutovalmiiksi</button> : null}
          {order.status === "ready" ? <button disabled={busyId === order.id} onClick={() => updateStatus(order, "collected")}>Merkitse noudetuksi</button> : null}
          {!['collected', 'cancelled'].includes(order.status) ? <button disabled={busyId === order.id} onClick={() => updateStatus(order, "cancelled")}>Peru varaus</button> : null}
        </div>
      </div>
    );
  };

  const openExternal = async (url) => {
    try {
      await Browser.open({ url });
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  if (unavailable) {
    return <div style={{ border: "1px dashed #94a3b8", borderRadius: 18, padding: 16, color: "#64748b", background: "#f8fafc" }}><strong>Kuluttajamyynti</strong><div style={{ marginTop: 5 }}>Kuluttajatilauksia ei voitu hakea. Nykyinen B2B-myynti toimii normaalisti.</div></div>;
  }

  return (
    <div style={{ border: "1px solid #86efac", borderRadius: 20, padding: 18, background: "#f0fdf4", display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
        <div><strong style={{ fontSize: 20 }}>Kuluttajatilaukset</strong><div style={{ color: "#47705c", marginTop: 4 }}>B2C-varaukset ovat erillään yritysostajien tarjouksista. Tilauksia yhteensä {orders.length}.</div></div>
        <button type="button" onClick={() => openExternal(getConsumerListingUrl("", DEFAULT_PUBLIC_APP_URL))} style={{ color: "#166534", fontWeight: 800 }}>Avaa kuluttajamarkkinapaikka</button>
      </div>
      {loading ? <div>Haetaan kuluttajaeriä ja tilauksia…</div> : null}
      {listings.length > 0 ? (
        <div style={{ display: "grid", gap: 9 }}>
          <strong>Omat kuluttajaerät</strong>
          {listings.map((listing) => {
            const link = getConsumerListingUrl(listing.id, DEFAULT_PUBLIC_APP_URL);
            const packageKilos = (listing.variants || []).filter((variant) => variant.sale_unit_type === "package").reduce((sum, variant) => sum + Number(variant.package_size_kg || 0) * Number(variant.available_units || 0), 0);
            const wholeFish = (listing.variants || []).filter((variant) => variant.sale_unit_type === "whole_fish");
            const minKilos = wholeFish.reduce((sum, variant) => sum + Number(variant.min_weight_kg || 0) * Number(variant.available_units || 0), 0);
            const maxKilos = wholeFish.reduce((sum, variant) => sum + Number(variant.max_weight_kg || 0) * Number(variant.available_units || 0), 0);
            const listingOrders = orders.filter((order) => order.listing_id === listing.id);
            return (
              <div key={listing.id} style={{ border: "1px solid #9fd5b2", borderRadius: 16, padding: 13, background: "white", display: "grid", gap: 8 }}>
                <div><strong>{listing.product_name || listing.species}</strong> · {listingStatusLabel[listing.status] || listing.status}</div>
                <div style={{ color: "#526b60", fontSize: 13 }}>{wholeFish.length > 0 ? `Arvioitu saldo ${minKilos.toLocaleString("fi-FI")}–${maxKilos.toLocaleString("fi-FI")} kg` : `Saldo ${packageKilos.toLocaleString("fi-FI")} kg`}</div>
                <div style={{ color: "#526b60", fontSize: 13 }}>Nouto {pickupTime(listing.pickup_start, listing.pickup_end)} · {listing.pickup_location}</div>
                <div style={{ color: "#526b60", fontSize: 13 }}>Tilaukset viimeistään {listing.order_deadline ? new Date(listing.order_deadline).toLocaleString("fi-FI", { dateStyle: "short", timeStyle: "short" }) : "–"}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => openExternal(link)}>Avaa julkinen linkki</button>
                  <button type="button" onClick={async () => { await navigator.clipboard.writeText(link); setMessage("Kalaerän julkinen linkki kopioitiin."); }}>Kopioi linkki</button>
                  <button type="button" disabled={busyId === listing.id} onClick={() => startEditingListing(listing)}>Muokkaa erää</button>
                  {listing.status === "published" ? <button type="button" disabled={busyId === listing.id} onClick={() => setListingSaleStatus(listing, "paused")}>Keskeytä myynti</button> : null}
                  {listing.status === "paused" ? <button type="button" disabled={busyId === listing.id} onClick={() => setListingSaleStatus(listing, "published")}>Jatka myyntiä</button> : null}
                </div>
                <div style={{ borderTop: "2px solid #dcf2e4", marginTop: 5, paddingTop: 12, display: "grid", gap: 9 }}>
                  <strong style={{ fontSize: 17 }}>Tämän erän tilaukset ({listingOrders.length})</strong>
                  {listingOrders.length > 0 ? listingOrders.map(renderOrderCard) : <div style={{ color: "#647a70", fontSize: 13 }}>Ei vielä tilauksia tähän kuluttajaerään.</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      {!loading && listings.length === 0 ? <div style={{ color: "#47705c" }}>Ei vielä kuluttajaeriä.</div> : null}
      {editingListing ? (
        <div role="dialog" aria-modal="true" aria-label="Muokkaa kuluttajaerää" style={{ position: "fixed", inset: 0, zIndex: 4000, display: "grid", placeItems: "center", padding: 14, background: "rgba(15, 35, 27, 0.66)" }} onMouseDown={(event) => { if (event.target === event.currentTarget && busyId !== editingListing.id) setEditingListing(null); }}>
          <form onSubmit={saveListing} style={{ width: "min(680px, 100%)", maxHeight: "calc(100dvh - 28px)", overflowY: "auto", borderRadius: 20, padding: 20, background: "white", display: "grid", gap: 14, boxShadow: "0 24px 80px rgba(0,0,0,.28)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <strong style={{ fontSize: 22 }}>Muokkaa kuluttajaerää</strong>
              <button type="button" disabled={busyId === editingListing.id} onClick={() => setEditingListing(null)} aria-label="Sulje">×</button>
            </div>
            <label style={{ display: "grid", gap: 5 }}><span>Tuotteen nimi</span><input required value={editingListing.productName} onChange={(event) => setEditingListing((current) => ({ ...current, productName: event.target.value }))} /></label>
            <label style={{ display: "grid", gap: 5 }}><span>Kuvaus kuluttajalle</span><textarea rows="3" value={editingListing.description} onChange={(event) => setEditingListing((current) => ({ ...current, description: event.target.value }))} /></label>
            <label style={{ display: "grid", gap: 5 }}><span>Noutopaikka</span><input required value={editingListing.pickupLocation} onChange={(event) => setEditingListing((current) => ({ ...current, pickupLocation: event.target.value }))} /></label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
              <label style={{ display: "grid", gap: 5 }}><span>Noudettavissa alkaen</span><input required type="datetime-local" value={editingListing.pickupStart} onChange={(event) => setEditingListing((current) => ({ ...current, pickupStart: event.target.value }))} /></label>
              <label style={{ display: "grid", gap: 5 }}><span>Noudettavissa asti</span><input required type="datetime-local" value={editingListing.pickupEnd} onChange={(event) => setEditingListing((current) => ({ ...current, pickupEnd: event.target.value }))} /></label>
              <label style={{ display: "grid", gap: 5 }}><span>Tilaukset viimeistään</span><input required type="datetime-local" value={editingListing.orderDeadline} onChange={(event) => setEditingListing((current) => ({ ...current, orderDeadline: event.target.value }))} /></label>
            </div>
            <strong>Myyntivaihtoehdot</strong>
            {editingListing.variants.map((variant) => (
              <div key={variant.id} style={{ border: "1px solid #bbdec8", borderRadius: 14, padding: 12, display: "grid", gap: 10 }}>
                <label style={{ display: "grid", gap: 5 }}><span>{variant.sale_unit_type === "whole_fish" ? "Kokoluokan nimi" : "Pakkauksen nimi"}</span><input required value={variant.label} onChange={(event) => updateEditingVariant(variant.id, "label", event.target.value)} /></label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 10 }}>
                  {variant.sale_unit_type === "package" ? (
                    <>
                      <label style={{ display: "grid", gap: 5 }}><span>Pakkauksen koko kg</span><input required inputMode="decimal" value={variant.package_size_kg} onChange={(event) => updateEditingVariant(variant.id, "package_size_kg", event.target.value)} /></label>
                      <label style={{ display: "grid", gap: 5 }}><span>Hinta / pakkaus (€)</span><input required inputMode="decimal" value={variant.unit_price_including_vat} onChange={(event) => updateEditingVariant(variant.id, "unit_price_including_vat", event.target.value)} /></label>
                    </>
                  ) : (
                    <>
                      <label style={{ display: "grid", gap: 5 }}><span>Pienin paino kg</span><input required inputMode="decimal" value={variant.min_weight_kg} onChange={(event) => updateEditingVariant(variant.id, "min_weight_kg", event.target.value)} /></label>
                      <label style={{ display: "grid", gap: 5 }}><span>Suurin paino kg</span><input required inputMode="decimal" value={variant.max_weight_kg} onChange={(event) => updateEditingVariant(variant.id, "max_weight_kg", event.target.value)} /></label>
                      <label style={{ display: "grid", gap: 5 }}><span>Kilohinta (€ / kg)</span><input required inputMode="decimal" value={variant.price_per_kg_including_vat} onChange={(event) => updateEditingVariant(variant.id, "price_per_kg_including_vat", event.target.value)} /></label>
                    </>
                  )}
                  <label style={{ display: "grid", gap: 5 }}><span>Jäljellä (kpl)</span><input required type="number" min="0" step="1" value={variant.available_units} onChange={(event) => updateEditingVariant(variant.id, "available_units", event.target.value)} /></label>
                </div>
              </div>
            ))}
            <div style={{ color: "#526b60", fontSize: 13 }}>Aiemmat varaukset säilyvät ennallaan. Jäljellä oleva määrä ei sisällä jo varattuja tuotteita.</div>
            {errorMessage ? <div style={{ color: "#b91c1c" }}>{errorMessage}</div> : null}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
              <button type="button" disabled={busyId === editingListing.id} onClick={() => setEditingListing(null)}>Peruuta</button>
              <button type="submit" disabled={busyId === editingListing.id}>{busyId === editingListing.id ? "Tallennetaan…" : "Tallenna muutokset"}</button>
            </div>
          </form>
        </div>
      ) : null}
      {message ? <div style={{ color: "#166534" }}>{message}</div> : null}
      {!editingListing && errorMessage ? <div style={{ color: "#b91c1c" }}>{errorMessage}</div> : null}
    </div>
  );
}
