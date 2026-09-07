import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { groupConsumerCommissionReservations } from "../lib/consumerAdminBilling.js";

const euro = (value) => `${Number(value || 0).toLocaleString("fi-FI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const statusLabel = { unbilled: "Laskuttamaton", invoiced: "Laskutettu", paid: "Maksettu" };
const orderStatusLabel = { reserved: "Varattu", confirmed: "Vahvistettu", ready: "Noutovalmis", collected: "Noudettu", cancelled: "Peruttu", expired: "Vanhentunut" };

export default function ConsumerAdminBillingPanel({ billingFilter = "unbilled", onExportSpreadsheet }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [monthFilter, setMonthFilter] = useState("latest");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: loadError } = await supabase.rpc("admin_list_consumer_commissions");
    if (loadError) {
      setRows([]);
      setError(loadError.message || "Kuluttajamyyntien provisioita ei voitu hakea.");
    } else {
      setRows(Array.isArray(data) ? data : []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const reservations = useMemo(() => groupConsumerCommissionReservations(rows), [rows]);
  const months = useMemo(() => Array.from(new Set(reservations.map((item) => item.commission_month).filter(Boolean))).sort((a, b) => b.localeCompare(a, "fi")), [reservations]);
  const activeMonth = monthFilter === "latest" ? (months[0] || "all") : monthFilter;
  const filteredReservations = reservations.filter((reservation) => {
    if (activeMonth !== "all" && reservation.commission_month !== activeMonth) return false;
    return billingFilter === "all" || reservation.commission_status === billingFilter;
  });
  const sellerGroups = Object.values(filteredReservations.reduce((groups, reservation) => {
    const sellerKey = reservation.seller_user_id || reservation.seller_name || "unknown";
    if (!groups[sellerKey]) groups[sellerKey] = { sellerKey, seller: reservation, reservations: [] };
    groups[sellerKey].reservations.push(reservation);
    return groups;
  }, {})).sort((left, right) => String(left.seller.seller_name || "").localeCompare(String(right.seller.seller_name || ""), "fi"));

  const updateStatus = async (reservation, status) => {
    setBusyId(reservation.id);
    setError("");
    const { error: updateError } = await supabase.rpc("admin_update_consumer_commission_status", {
      p_reservation_group_id: reservation.id,
      p_status: status,
    });
    if (updateError) setError(updateError.message || "Provision tilan päivittäminen epäonnistui.");
    else await load();
    setBusyId("");
  };

  const exportSeller = (group) => {
    if (typeof onExportSpreadsheet !== "function") return;
    const sellerName = group.seller.seller_name || "kalastaja";
    const safeSeller = sellerName.replace(/[^a-z0-9åäö_-]+/gi, "-");
    void onExportSpreadsheet(
      `kuluttajamyynti-laskutus-${activeMonth}-${safeSeller}.xlsx`,
      [
        ["Kuukausi", "Kalastaja", "Y-tunnus", "Varaus", "Kalaerä", "Tuote", "Tilatut tuotteet", "Sis. ALV €", "Veroton myynti €", "Provisio %", "Provisio €", "Tilauspäivä", "Tilauksen tila", "Provision tila"],
        ...group.reservations.map((reservation) => [
          reservation.commission_month,
          sellerName,
          reservation.seller_business_id || "",
          String(reservation.id).slice(0, 8).toUpperCase(),
          reservation.batch_id || "",
          reservation.product_name || reservation.species || "Kalaerä",
          reservation.lines.join(" | "),
          reservation.totalIncludingVat.toFixed(2),
          reservation.netTradeValue.toFixed(2),
          (Number(reservation.commission_rate || 0) * 100).toFixed(1),
          reservation.commissionAmount.toFixed(2),
          reservation.created_at || "",
          orderStatusLabel[reservation.order_status] || reservation.order_status,
          statusLabel[reservation.commission_status] || reservation.commission_status,
        ]),
      ],
      "Kuluttajamyynti"
    );
  };

  const totals = filteredReservations.reduce((sum, reservation) => ({
    trade: sum.trade + reservation.netTradeValue,
    commission: sum.commission + reservation.commissionAmount,
  }), { trade: 0, commission: 0 });

  const card = { border: "1px solid #bfdbfe", borderRadius: 18, padding: 16, background: "#fff" };
  const badge = { display: "inline-flex", border: "1px solid #cbd5e1", borderRadius: 999, padding: "5px 9px", background: "#f8fafc", color: "#334155", fontSize: 12, fontWeight: 750 };
  const button = { border: "1px solid #93c5fd", borderRadius: 10, padding: "8px 11px", background: "#fff", color: "#1e3a8a", fontWeight: 750, cursor: "pointer" };

  return (
    <section style={{ display: "grid", gap: 14, marginTop: 24 }}>
      <div style={{ ...card, background: "#eff6ff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
          <div><strong style={{ fontSize: 20 }}>Kuluttajamyynnin provisiot</strong><div style={{ color: "#475569", marginTop: 4 }}>Jokaisesta tehdystä kuluttajatilauksesta laskutetaan tilaukselle tallennettu provisio, myös jos tilaus myöhemmin perutaan tai jää noutamatta.</div></div>
          <select value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} style={{ minHeight: 42, border: "1px solid #93c5fd", borderRadius: 12, padding: "8px 12px", background: "#fff" }}>
            <option value="latest">Uusin kuukausi</option>
            {months.length > 1 ? <option value="all">Kaikki kuukaudet</option> : null}
            {months.map((month) => <option value={month} key={month}>{month}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 13 }}>
          <span style={badge}>{filteredReservations.length} tilausta</span>
          <span style={badge}>{sellerGroups.length} kalastajaa</span>
          <span style={badge}>{euro(totals.trade)} veroton myynti</span>
          <span style={{ ...badge, borderColor: "#86efac", background: "#ecfdf5", color: "#166534" }}>{euro(totals.commission)} provisio</span>
        </div>
      </div>

      {loading ? <div style={card}>Haetaan kuluttajamyyntien provisioita…</div> : null}
      {error ? <div style={{ ...card, borderColor: "#fecaca", background: "#fef2f2", color: "#991b1b" }}>{error}</div> : null}
      {!loading && !error && sellerGroups.length === 0 ? <div style={card}>Ei kuluttajamyyntien provisioita valitulla rajauksella.</div> : null}

      {sellerGroups.map((group) => {
        const seller = group.seller;
        const groupCommission = group.reservations.reduce((sum, reservation) => sum + reservation.commissionAmount, 0);
        const billingAddress = [seller.seller_billing_address, [seller.seller_billing_postcode, seller.seller_billing_city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
        return (
          <details key={group.sellerKey} style={card} open>
            <summary style={{ cursor: "pointer", fontWeight: 850, fontSize: 17 }}>
              {seller.seller_name || "Tuntematon kalastaja"} · {euro(groupCommission)} provisio
            </summary>
            <div style={{ color: "#64748b", fontSize: 13, marginTop: 7 }}>{[seller.seller_business_id ? `Y-tunnus ${seller.seller_business_id}` : "", seller.seller_billing_email || seller.seller_email || "", billingAddress].filter(Boolean).join(" · ")}</div>
            <div style={{ marginTop: 10 }}><button type="button" style={button} onClick={() => exportSeller(group)}>Vie laskutusaineisto Exceliin</button></div>
            <div style={{ display: "grid", gap: 9, marginTop: 12 }}>
              {group.reservations.map((reservation) => (
                <div key={reservation.id} style={{ border: "1px solid #dbeafe", borderRadius: 14, padding: 12, display: "grid", gap: 7 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}><strong>{reservation.product_name || reservation.species || "Kalaerä"} · {reservation.lines.join(", ")}</strong><span style={badge}>{statusLabel[reservation.commission_status] || reservation.commission_status}</span></div>
                  <div style={{ color: "#475569", fontSize: 13 }}>Erä {reservation.batch_id || "-"} · varaus {String(reservation.id).slice(0, 8).toUpperCase()} · {orderStatusLabel[reservation.order_status] || reservation.order_status}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><span style={badge}>{euro(reservation.netTradeValue)} veroton myynti</span><span style={{ ...badge, borderColor: "#86efac", background: "#ecfdf5" }}>{euro(reservation.commissionAmount)} provisio ({(Number(reservation.commission_rate || 0) * 100).toLocaleString("fi-FI")} %)</span></div>
                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                    {reservation.commission_status !== "invoiced" ? <button type="button" style={button} disabled={busyId === reservation.id} onClick={() => updateStatus(reservation, "invoiced")}>Merkitse laskutetuksi</button> : null}
                    {reservation.commission_status !== "paid" ? <button type="button" style={{ ...button, background: "#2563eb", color: "#fff" }} disabled={busyId === reservation.id} onClick={() => updateStatus(reservation, "paid")}>Merkitse maksetuksi</button> : null}
                    {reservation.commission_status !== "unbilled" ? <button type="button" style={button} disabled={busyId === reservation.id} onClick={() => updateStatus(reservation, "unbilled")}>Palauta laskuttamattomaksi</button> : null}
                  </div>
                </div>
              ))}
            </div>
          </details>
        );
      })}
    </section>
  );
}
