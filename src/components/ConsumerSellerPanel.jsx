import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { invokeConsumerOrderAction } from "../services/edgeFunctions.js";
import { getConsumerListingUrl } from "../lib/consumerMarketplace.js";
import { DEFAULT_PUBLIC_APP_URL } from "../lib/supabase.js";

const money = (value) => `${Number(value || 0).toLocaleString("fi-FI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const statusLabel = { reserved: "Uusi varaus", confirmed: "Vahvistettu", ready: "Valmis noudettavaksi", collected: "Noudettu", cancelled: "Peruttu", expired: "Vanhentunut" };
const pickupTime = (start, end) => start ? `${new Date(start).toLocaleString("fi-FI", { dateStyle: "short", timeStyle: "short" })}${end ? `–${new Date(end).toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit" })}` : ""}` : "Noutoaika puuttuu";

export default function ConsumerSellerPanel({ profile }) {
  const [orders, setOrders] = useState([]);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [finalWeights, setFinalWeights] = useState({});

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    const [ordersResult, listingsResult] = await Promise.all([
      supabase
        .from("consumer_orders")
        .select("id, status, consumer_name, consumer_email, consumer_phone, consumer_note, sale_unit_type, variant_label, unit_count, package_count, estimated_weight_kg, final_weight_kg, total_including_vat, commission_amount, commission_status, created_at, consumer_listings(product_name, species, pickup_location, batch_id)")
        .eq("seller_user_id", profile.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("consumer_listings")
        .select("id, product_name, species, status, pickup_location, pickup_start, pickup_end, order_deadline, created_at, variants:consumer_listing_variants(sale_unit_type, package_size_kg, min_weight_kg, max_weight_kg, available_units)")
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
    const { data: sessionData } = await supabase.auth.getSession();
    const finalWeightKg = status === "collected" && order.sale_unit_type === "whole_fish"
      ? String(finalWeights[order.id] || "").replace(",", ".")
      : null;
    if (status === "collected" && order.sale_unit_type === "whole_fish" && !(Number(finalWeightKg) > 0)) {
      setMessage("Täytä punnittu lopullinen paino ennen kuin merkitset tilauksen noudetuksi.");
      setBusyId("");
      return;
    }
    const result = await invokeConsumerOrderAction(sessionData?.session?.access_token, { action: "seller_update_order", orderId: order.id, status, finalWeightKg });
    if (result.error) setMessage(result.error.message || "Tilauksen päivitys epäonnistui.");
    else { setMessage("Kuluttajatilauksen tila päivitettiin."); await load(); }
    setBusyId("");
  };

  if (unavailable) {
    return <div style={{ border: "1px dashed #94a3b8", borderRadius: 18, padding: 16, color: "#64748b", background: "#f8fafc" }}><strong>Kuluttajamyynti</strong><div style={{ marginTop: 5 }}>Kuluttajatilauksia ei voitu hakea. Nykyinen B2B-myynti toimii normaalisti.</div></div>;
  }

  return (
    <div style={{ border: "1px solid #86efac", borderRadius: 20, padding: 18, background: "#f0fdf4", display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
        <div><strong style={{ fontSize: 20 }}>Kuluttajatilaukset</strong><div style={{ color: "#47705c", marginTop: 4 }}>B2C-varaukset ovat erillään yritysostajien tarjouksista.</div></div>
        <a href="/kuluttaja" target="_blank" rel="noreferrer" style={{ color: "#166534", fontWeight: 800 }}>Avaa kuluttajamarkkinapaikka</a>
      </div>
      {listings.length > 0 ? (
        <div style={{ display: "grid", gap: 9 }}>
          <strong>Omat kuluttajaerät</strong>
          {listings.map((listing) => {
            const link = getConsumerListingUrl(listing.id, DEFAULT_PUBLIC_APP_URL);
            const packageKilos = (listing.variants || []).filter((variant) => variant.sale_unit_type === "package").reduce((sum, variant) => sum + Number(variant.package_size_kg || 0) * Number(variant.available_units || 0), 0);
            const wholeFish = (listing.variants || []).filter((variant) => variant.sale_unit_type === "whole_fish");
            const minKilos = wholeFish.reduce((sum, variant) => sum + Number(variant.min_weight_kg || 0) * Number(variant.available_units || 0), 0);
            const maxKilos = wholeFish.reduce((sum, variant) => sum + Number(variant.max_weight_kg || 0) * Number(variant.available_units || 0), 0);
            return (
              <div key={listing.id} style={{ border: "1px solid #bbdec8", borderRadius: 14, padding: 12, background: "white", display: "grid", gap: 7 }}>
                <div><strong>{listing.product_name || listing.species}</strong> · {listing.status === "published" ? "Myynnissä" : listing.status === "sold_out" ? "Loppuunmyyty" : listing.status}</div>
                <div style={{ color: "#526b60", fontSize: 13 }}>{wholeFish.length > 0 ? `Arvioitu saldo ${minKilos.toLocaleString("fi-FI")}–${maxKilos.toLocaleString("fi-FI")} kg` : `Saldo ${packageKilos.toLocaleString("fi-FI")} kg`}</div>
                <div style={{ color: "#526b60", fontSize: 13 }}>Nouto {pickupTime(listing.pickup_start, listing.pickup_end)} · {listing.pickup_location}</div>
                <div style={{ color: "#526b60", fontSize: 13 }}>Tilaukset viimeistään {listing.order_deadline ? new Date(listing.order_deadline).toLocaleString("fi-FI", { dateStyle: "short", timeStyle: "short" }) : "–"}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <a href={link} target="_blank" rel="noreferrer">Avaa julkinen linkki</a>
                  <button type="button" onClick={async () => { await navigator.clipboard.writeText(link); setMessage("Kalaerän julkinen linkki kopioitiin."); }}>Kopioi linkki</button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      {message ? <div style={{ color: "#166534" }}>{message}</div> : null}
      {loading ? <div>Haetaan kuluttajatilauksia…</div> : orders.length === 0 ? <div style={{ color: "#47705c" }}>Ei vielä kuluttajatilauksia.</div> : orders.map((order) => (
        <div key={order.id} style={{ border: "1px solid #bbdec8", borderRadius: 15, padding: 14, background: "white", display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><strong>{order.product_name || order.species || "Kalaerä"}</strong><span>{statusLabel[order.status] || order.status}</span></div>
          <div style={{ color: "#526b60" }}>{order.unit_count || order.package_count} × {order.variant_label || (order.sale_unit_type === "whole_fish" ? "kokonainen kala" : "pakkaus")} · {money(order.total_including_vat)} · {order.pickup_location || "Noutopaikka puuttuu"}</div>
          {order.sale_unit_type === "whole_fish" && order.estimated_weight_kg ? <div style={{ color: "#526b60" }}>Arvioitu paino {Number(order.estimated_weight_kg).toLocaleString("fi-FI")} kg · lopullinen paino vahvistetaan noudettaessa</div> : null}
          {order.sale_unit_type === "whole_fish" && order.status === "ready" ? (
            <label style={{ display: "grid", gap: 5, maxWidth: 260 }}>
              <span>Punnittu lopullinen paino (kg)</span>
              <input inputMode="decimal" value={finalWeights[order.id] || ""} onChange={(event) => setFinalWeights((current) => ({ ...current, [order.id]: event.target.value }))} placeholder="Esim. 2,65" />
            </label>
          ) : null}
          {order.sale_unit_type === "whole_fish" && order.final_weight_kg ? <div style={{ color: "#526b60" }}>Lopullinen paino {Number(order.final_weight_kg).toLocaleString("fi-FI")} kg</div> : null}
          <div style={{ color: "#526b60" }}>{order.consumer_name || order.consumer_email} · {order.consumer_phone}</div>
          {order.consumer_note ? <div style={{ color: "#526b60" }}>Viesti: {order.consumer_note}</div> : null}
          <div style={{ color: "#526b60", fontSize: 13 }}>Palvelukomissio: {money(order.commission_amount)} · {order.commission_status === "unbilled" ? "laskuttamatta" : order.commission_status}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {order.status === "reserved" ? <button disabled={busyId === order.id} onClick={() => updateStatus(order, "confirmed")}>Vahvista varaus</button> : null}
            {["confirmed", "reserved"].includes(order.status) ? <button disabled={busyId === order.id} onClick={() => updateStatus(order, "ready")}>Merkitse noutovalmiiksi</button> : null}
            {order.status === "ready" ? <button disabled={busyId === order.id} onClick={() => updateStatus(order, "collected")}>Merkitse noudetuksi</button> : null}
            {!['collected', 'cancelled'].includes(order.status) ? <button disabled={busyId === order.id} onClick={() => updateStatus(order, "cancelled")}>Peru varaus</button> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
