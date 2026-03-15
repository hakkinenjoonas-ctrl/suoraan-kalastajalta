import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://exuqgemipmaqdkficlfn.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_6OpTn3AxVjMnpei8Bpsy7A_Y8kOXaZP";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

const fishSpecies = ["Muikku", "Kuha", "Ahven", "Hauki", "Lahna", "Särki", "Säyne", "Siika", "Made", "Muu"];
const defaultFishPrices = {
  Hauki: 3,
  Kuha: 7,
  Ahven: 4,
  Lahna: 0.8,
  Säyne: 0.8,
  Siika: 5,
  Muikku: 2,
};
const gearTypes = ["Rysä", "Verkko", "Katiska", "Trooli", "Onki", "Muu"];
const destinations = ["Myyntiin", "Oma käyttö", "Jalostukseen", "Tukkuun", "Muu"];
const deliveryMethods = ["Nouto", "Myyjä toimittaa", "Kuljetus järjestetään", "Sovitaan erikseen"];
const defaultAreas = ["Suur-Saimaa", "Pien-Saimaa", "Saimaa", "Muu vesialue"];
const fishingSpots = [
  { name: "Kyläniemen pohjoispuoli", lat: 61.33, lng: 28.18 },
  { name: "Kyläniemen eteläpuoli", lat: 61.28, lng: 28.22 },
  { name: "Sammaljärven ok", lat: 61.25, lng: 28.35 },
];

function safeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createSpeciesRow() {
  return { id: safeId(), species: "Muikku", kilos: "", count: "" };
}

function euro(value) {
  return new Intl.NumberFormat("fi-FI", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function exportCsv(filename, rows) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(";"))
    .join("
");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function isMissingRefreshTokenError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("invalid refresh token") || message.includes("refresh token not found");
}

async function clearBrokenSession() {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // ignore
  }

  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.includes("supabase")) keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch {
    // ignore
  }
}

function runLocalTests() {
  const tests = [
    { name: "Muikun oletushinta löytyy", pass: defaultFishPrices.Muikku === 2 },
    { name: "Kuha on kalalistassa", pass: fishSpecies.includes("Kuha") },
    { name: "Pyyntipaikkoja on 3", pass: fishingSpots.length === 3 },
    { name: "Refresh token -virhe tunnistuu", pass: isMissingRefreshTokenError(new Error("Invalid Refresh Token: Refresh Token Not Found")) },
  ];
  const failed = tests.filter((test) => !test.pass);
  if (failed.length > 0) {
    console.error("Paikalliset testit epäonnistuivat:", failed);
  }
}

const styles = {
  app: {
    minHeight: "100vh",
    background: "#f8fafc",
    color: "#0f172a",
    fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    padding: 16,
  },
  container: { maxWidth: 1280, margin: "0 auto" },
  card: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 20,
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
  },
  headerCard: { padding: 20, marginBottom: 18 },
  sectionCard: { padding: 18 },
  row: { display: "flex", gap: 12, flexWrap: "wrap" },
  rowBetween: {
    display: "flex",
    gap: 12,
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
  },
  title: { margin: 0, fontSize: 32, lineHeight: 1.1 },
  subtitle: { margin: "6px 0 0", color: "#475569", fontSize: 14 },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 12px",
    borderRadius: 999,
    background: "#eef2ff",
    color: "#1e293b",
    fontSize: 14,
    border: "1px solid #cbd5e1",
  },
  toolbar: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  tabs: {
    display: "grid",
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
    gap: 8,
    background: "#fff",
    border: "1px solid #e2e8f0",
    padding: 8,
    borderRadius: 18,
    marginBottom: 16,
  },
  tabs6: {
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
    gap: 8,
    background: "#fff",
    border: "1px solid #e2e8f0",
    padding: 8,
    borderRadius: 18,
    marginBottom: 16,
  },
  tab: {
    border: 0,
    background: "transparent",
    padding: "12px 10px",
    borderRadius: 14,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    color: "#0f172a",
  },
  activeTab: { background: "#0f172a", color: "#fff" },
  grid3: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16 },
  grid2: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 },
  stack: { display: "flex", flexDirection: "column", gap: 12 },
  metric: { fontSize: 34, fontWeight: 700, margin: "8px 0 0" },
  muted: { color: "#64748b", fontSize: 14 },
  progress: { height: 12, background: "#e2e8f0", borderRadius: 999, overflow: "hidden" },
  progressFill: { display: "block", height: "100%", background: "#0f172a", borderRadius: 999 },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 },
  field: { display: "flex", flexDirection: "column", gap: 8 },
  fieldFull: { gridColumn: "1 / -1" },
  input: {
    width: "100%",
    padding: "12px 14px",
    border: "1px solid #cbd5e1",
    borderRadius: 14,
    background: "#fff",
    font: "inherit",
    boxSizing: "border-box",
  },
  textarea: {
    width: "100%",
    padding: "12px 14px",
    border: "1px solid #cbd5e1",
    borderRadius: 14,
    background: "#fff",
    font: "inherit",
    minHeight: 96,
    resize: "vertical",
    boxSizing: "border-box",
  },
  button: {
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#0f172a",
    borderRadius: 14,
    padding: "11px 14px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryButton: { background: "#0f172a", color: "#fff", borderColor: "#0f172a" },
  speciesBox: {
    border: "1px solid #e2e8f0",
    borderRadius: 18,
    background: "#f8fafc",
    padding: 16,
  },
  speciesRow: {
    display: "grid",
    gridTemplateColumns: "1.4fr 0.8fr 0.8fr auto",
    gap: 12,
    alignItems: "end",
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    padding: 12,
  },
  entry: {
    border: "1px solid #e2e8f0",
    borderRadius: 18,
    padding: 14,
    background: "#fff",
  },
  entryHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  entryBadges: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 },
  noticeError: {
    padding: "12px 14px",
    borderRadius: 14,
    fontSize: 14,
    background: "#fef2f2",
    color: "#b91c1c",
    border: "1px solid #fecaca",
  },
  noticeInfo: {
    padding: "12px 14px",
    borderRadius: 14,
    fontSize: 14,
    background: "#eff6ff",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe",
    whiteSpace: "pre-wrap",
  },
  noticeSuccess: {
    padding: "12px 14px",
    borderRadius: 14,
    fontSize: 14,
    background: "#ecfdf5",
    color: "#047857",
    border: "1px solid #a7f3d0",
    whiteSpace: "pre-wrap",
  },
  small: { fontSize: 12, color: "#64748b" },
};

function responsiveGridStyle(base) {
  if (typeof window !== "undefined" && window.innerWidth < 960) {
    return { ...base, gridTemplateColumns: "1fr" };
  }
  return base;
}

function AuthView({ authMode, setAuthMode, authForm, setAuthForm, onSignIn, onSignUp, authError, authInfo }) {
  return (
    <div style={styles.app}>
      <div style={{ ...styles.container, maxWidth: 520 }}>
        <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
          <h1 style={styles.title}>Suoraan Kalastajalta</h1>
          <div style={{ ...styles.tabs6, gridTemplateColumns: "1fr 1fr", marginBottom: 0 }}>
            <button style={{ ...styles.tab, ...(authMode === "signin" ? styles.activeTab : {}) }} onClick={() => setAuthMode("signin")}>Kirjaudu</button>
            <button style={{ ...styles.tab, ...(authMode === "signup" ? styles.activeTab : {}) }} onClick={() => setAuthMode("signup")}>Rekisteröidy</button>
          </div>

          <div style={styles.field}>
            <label>Sähköposti</label>
            <input style={styles.input} type="email" value={authForm.email} onChange={(e) => setAuthForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="esim. nimi@yritys.fi" />
          </div>

          <div style={styles.field}>
            <label>Salasana</label>
            <input style={styles.input} type="password" value={authForm.password} onChange={(e) => setAuthForm((prev) => ({ ...prev, password: e.target.value }))} placeholder="salasana" />
          </div>

          {authMode === "signup" ? (
            <div style={styles.field}>
              <label>Nimi</label>
              <input style={styles.input} value={authForm.displayName} onChange={(e) => setAuthForm((prev) => ({ ...prev, displayName: e.target.value }))} placeholder="Esim. Joonas Häkkinen" />
            </div>
          ) : null}

          {authError ? <div style={styles.noticeError}>{authError}</div> : null}
          {authInfo ? <div style={styles.noticeSuccess}>{authInfo}</div> : null}

          {authMode === "signin" ? (
            <button style={{ ...styles.button, ...styles.primaryButton }} onClick={onSignIn}>Kirjaudu sisään</button>
          ) : (
            <button style={{ ...styles.button, ...styles.primaryButton }} onClick={onSignUp}>Luo tunnus</button>
          )}

          <div style={styles.small}>Järjestys: 1) lisää sähköposti allowed_users-listaan, 2) rekisteröidy tällä sähköpostilla, 3) kirjaudu sisään.</div>
        </div>
      </div>
    </div>
  );
}

function WholesaleOffersView({
  profile,
  saleEntries,
  offers,
  buyerOffers,
  offerForm,
  setOfferForm,
  onCreateOffer,
  onUpdateOfferStatus,
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

  const groupedBuyerOffers = saleEntries.map((entry) => {
    const batchMatches = (buyerOffers || []).filter(
      (offer) => offer.batch_id && entry.batchId && offer.batch_id === entry.batchId,
    );

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
      entryOffers: offers.filter((offer) => offer.entry_id === entry.id),
      buyerMatches: [...batchMatches, ...entryMatches].sort(
        (a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime(),
      ),
    };
  });

  return (
    <div style={styles.grid2}>
      <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
        <strong>Myyntiin merkityt erät</strong>

        {groupedBuyerOffers.length === 0 ? (
          <div style={styles.muted}>Ei vielä myyntiin merkittyjä eriä.</div>
        ) : (
          groupedBuyerOffers.map(({ entry, entryOffers, buyerMatches }) => (
            <div key={entry.id} style={styles.entry}>
              <div style={styles.entryHeader}>
                <div>
                  <div style={styles.entryBadges}>
                    <span style={styles.badge}>{entry.species}</span>
                    <span style={styles.badge}>{entry.kilos} kg</span>
                    <span style={styles.badge}>{entry.destination}</span>
                    <span style={styles.badge}>{entry.ownerName}</span>
                    {entry.offerToShops ? <span style={styles.badge}>Kauppoihin</span> : null}
                    {entry.offerToRestaurants ? <span style={styles.badge}>Ravintoloihin</span> : null}
                    {entry.offerToWholesalers ? <span style={styles.badge}>Tukkuihin</span> : null}
                  </div>
                  <div style={styles.muted}>{entry.date} · {entry.area}{entry.spot ? ` / ${entry.spot}` : ""}</div>
                  <div style={styles.muted}>Oletushinta: {euro(entry.pricePerKg)} / kg</div>
                  <div style={styles.muted}>Toimitus: {entry.deliveryMethod || "-"} · {entry.deliveryArea || "-"} · Kulu {entry.deliveryCost !== "" && entry.deliveryCost != null ? `${entry.deliveryCost} €` : "-"} · Aikaisin {entry.earliestDeliveryDate || "-"} · Kylmäkuljetus {entry.coldTransport ? "kyllä" : "ei"}</div>
                </div>
              </div>

              <div style={{ ...styles.stack, marginTop: 12 }}>
                <div style={styles.small}>Suorat tarjoukset tälle erälle: {entryOffers.length}</div>
                {entryOffers.map((offer) => (
                  <div key={offer.id} style={{ ...styles.entry, background: "#f8fafc" }}>
                    <div style={styles.entryHeader}>
                      <div>
                        <div style={styles.entryBadges}>
                          <span style={styles.badge}>{offer.company_name}</span>
                          <span style={styles.badge}>{euro(offer.offer_price_per_kg)} / kg</span>
                          <span style={styles.badge}>{offer.contact_name}</span>
                          <span style={styles.badge}>{offer.status}</span>
                        </div>
                        <div style={styles.muted}>{offer.contact_email}{offer.contact_phone ? ` · ${offer.contact_phone}` : ""}</div>
                        {offer.message ? <div style={styles.muted}>{offer.message}</div> : null}
                      </div>
                      {profile?.role === "owner" || profile?.id === entry.ownerUserId ? (
                        <div style={styles.row}>
                          <button style={styles.button} onClick={() => onUpdateOfferStatus(offer, "accepted")}>Hyväksy</button>
                          <button style={styles.button} onClick={() => onUpdateOfferStatus(offer, "rejected")}>Hylkää</button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}

                <div style={styles.small}>Ostajien vastaukset: {buyerMatches.length}</div>
                {buyerMatches.length === 0 ? (
                  <div style={styles.muted}>Ei vielä ostajien vastauksia.</div>
                ) : (
                  buyerMatches.map((offer) => {
                    const revealIdentity = shouldRevealBuyerIdentity(offer.status);
                    const buyerIdentity = revealIdentity ? (offer.buyer_company_name || offer.buyer_email || "Ostaja") : buyerTypeLabel(offer.buyer_type);

                    return (
                      <div key={offer.id} style={{ ...styles.entry, background: "#f8fafc", borderLeft: "4px solid #0f172a" }}>
                        <div style={{ ...styles.rowBetween, marginBottom: 10 }}>
                          <strong>{formatOfferDate(offer.updated_at || offer.created_at)}</strong>
                          <div style={styles.entryBadges}>
                            <span style={styles.badge}>{buyerStatusLabel(offer.status)}</span>
                            <span style={styles.badge}>{buyerIdentity}</span>
                          </div>
                        </div>

                        <div style={{ ...styles.grid2, marginBottom: 10 }}>
                          <div>
                            <div style={styles.muted}><strong>Erä:</strong> {offer.species_summary || "-"}</div>
                            <div style={styles.muted}><strong>Määrä:</strong> {offer.total_kilos} kg</div>
                            <div style={styles.muted}><strong>Alue:</strong> {offer.area || "-"}{offer.spot ? ` / ${offer.spot}` : ""}</div>
                          </div>
                          <div>
                            <div style={styles.muted}><strong>Pyyntihinta:</strong> {offer.price_per_kg !== "" && offer.price_per_kg != null ? `${euro(offer.price_per_kg)} / kg` : "-"}</div>
                            <div style={styles.muted}><strong>Vastatarjous:</strong> {offer.counter_price_per_kg !== "" && offer.counter_price_per_kg != null ? `${euro(offer.counter_price_per_kg)} / kg` : "-"}</div>
                            <div style={styles.muted}><strong>Varattu:</strong> {offer.reserved_kilos !== "" && offer.reserved_kilos != null ? `${offer.reserved_kilos} kg` : "-"}</div>
                          </div>
                        </div>

                        <div style={{ ...styles.entry, background: "#fff", padding: 12, marginBottom: 10 }}>
                          <div style={styles.muted}><strong>Toimitus</strong></div>
                          <div style={styles.muted}>Tapa: {entry.deliveryMethod || "-"}</div>
                          <div style={styles.muted}>Alue: {entry.deliveryArea || "-"}</div>
                          <div style={styles.muted}>Kulu: {entry.deliveryCost !== "" && entry.deliveryCost != null ? `${entry.deliveryCost} €` : "-"}</div>
                          <div style={styles.muted}>Aikaisin toimitus: {entry.earliestDeliveryDate || "-"}</div>
                          <div style={styles.muted}>Kylmäkuljetus: {entry.coldTransport ? "kyllä" : "ei"}</div>
                        </div>

                        {offer.buyer_message ? (
                          <div style={{ ...styles.entry, background: "#fff", padding: 12, marginBottom: 10 }}>
                            <div style={styles.muted}><strong>Ostajan viesti</strong></div>
                            <div>{offer.buyer_message}</div>
                          </div>
                        ) : null}

                        {revealIdentity ? (
                          <div style={{ ...styles.entry, background: "#fff", padding: 12, marginBottom: 10 }}>
                            <div style={styles.muted}><strong>Yhteystiedot</strong></div>
                            <div>{offer.buyer_company_name || "-"}</div>
                            <div>{offer.buyer_contact_name || "-"}</div>
                            <div>{offer.buyer_email || "-"}{offer.buyer_phone ? ` · ${offer.buyer_phone}` : ""}</div>
                          </div>
                        ) : null}

                        {!revealIdentity && (profile?.role === "owner" || profile?.id === entry.ownerUserId) ? (
                          <div style={styles.row}>
                            {offer.status !== "accepted" ? <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => onUpdateOfferStatus(offer, "accepted")}>Hyväksy kauppa</button> : null}
                            {offer.status !== "rejected" ? <button style={styles.button} onClick={() => onUpdateOfferStatus(offer, "rejected")}>Hylkää</button> : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}

                <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack, marginTop: 8 }}>
                  <strong>Tee tarjous tästä erästä</strong>
                  <div style={styles.field}>
                    <label>Yritys</label>
                    <input style={styles.input} value={offerForm.company_name} onChange={(e) => setOfferForm((prev) => ({ ...prev, company_name: e.target.value }))} placeholder="Esim. Forelli / tukku" />
                  </div>
                  <div style={styles.field}>
                    <label>Yhteyshenkilö</label>
                    <input style={styles.input} value={offerForm.contact_name} onChange={(e) => setOfferForm((prev) => ({ ...prev, contact_name: e.target.value }))} placeholder="Nimi" />
                  </div>
                  <div style={styles.field}>
                    <label>Sähköposti</label>
                    <input style={styles.input} type="email" value={offerForm.contact_email} onChange={(e) => setOfferForm((prev) => ({ ...prev, contact_email: e.target.value }))} placeholder="email@yritys.fi" />
                  </div>
                  <div style={styles.field}>
                    <label>Puhelin</label>
                    <input style={styles.input} value={offerForm.contact_phone} onChange={(e) => setOfferForm((prev) => ({ ...prev, contact_phone: e.target.value }))} placeholder="Puhelin" />
                  </div>
                  <div style={styles.field}>
                    <label>Tarjous €/kg</label>
                    <input style={styles.input} type="number" value={offerForm.offer_price_per_kg} onChange={(e) => setOfferForm((prev) => ({ ...prev, offer_price_per_kg: e.target.value }))} placeholder="0" />
                  </div>
                  <div style={styles.field}>
                    <label>Viesti</label>
                    <textarea style={styles.textarea} value={offerForm.message} onChange={(e) => setOfferForm((prev) => ({ ...prev, message: e.target.value }))} placeholder="Toimitus, nouto, lisäehdot" />
                  </div>
                  <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => onCreateOffer(entry)}>Lähetä tarjous</button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
        <strong>Ostajien viimeisimmät vastaukset</strong>
        {!buyerOffers || buyerOffers.length === 0 ? (
          <div style={styles.muted}>Ei vielä ostajille lähetettyjä tarjousrivejä.</div>
        ) : (
          buyerOffers.slice(0, 20).map((offer) => {
            const revealIdentity = shouldRevealBuyerIdentity(offer.status);
            return (
              <div key={offer.id} style={{ ...styles.entry, borderLeft: "4px solid #0f172a" }}>
                <div style={{ ...styles.rowBetween, marginBottom: 8 }}>
                  <strong>{formatOfferDate(offer.updated_at || offer.created_at)}</strong>
                  <div style={styles.entryBadges}>
                    <span style={styles.badge}>{buyerStatusLabel(offer.status)}</span>
                    <span style={styles.badge}>{revealIdentity ? (offer.buyer_company_name || offer.buyer_email || "Ostaja") : buyerTypeLabel(offer.buyer_type)}</span>
                  </div>
                </div>
                <div>
                  <div style={styles.muted}><strong>Erä:</strong> {offer.species_summary || "-"}</div>
                  <div style={styles.muted}><strong>Määrä:</strong> {offer.total_kilos} kg</div>
                  {offer.counter_price_per_kg !== "" && offer.counter_price_per_kg != null ? <div style={styles.muted}><strong>Vastatarjous:</strong> {euro(offer.counter_price_per_kg)} / kg</div> : null}
                  {offer.reserved_kilos !== "" && offer.reserved_kilos != null ? <div style={styles.muted}><strong>Varattu:</strong> {offer.reserved_kilos} kg</div> : null}
                  {offer.buyer_message ? <div style={styles.muted}><strong>Viesti:</strong> {offer.buyer_message}</div> : null}
                  {revealIdentity ? <div style={styles.muted}><strong>Yhteystiedot:</strong> {offer.buyer_contact_name || "-"} · {offer.buyer_email || "-"}{offer.buyer_phone ? ` · ${offer.buyer_phone}` : ""}</div> : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function ReportsView({ entries, offers }) {
  const reportRows = entries.map((entry) => [
    entry.date,
    entry.ownerName,
    entry.area,
    entry.spot,
    entry.species,
    entry.kilos,
    entry.count,
    entry.gear,
    entry.gearCount,
    entry.destination,
    entry.buyer,
    entry.pricePerKg,
    entry.kilos * entry.pricePerKg,
    entry.deliveryMethod,
    entry.deliveryArea,
    entry.deliveryCost,
    entry.earliestDeliveryDate,
    entry.coldTransport ? "Kyllä" : "Ei",
    entry.notes,
  ]);

  const offerRows = offers.map((offer) => [
    offer.created_at || "",
    offer.company_name,
    offer.contact_name,
    offer.contact_email,
    offer.contact_phone,
    offer.offer_price_per_kg,
    offer.status,
    offer.message,
  ]);

  const totalKg = entries.reduce((sum, entry) => sum + Number(entry.kilos || 0), 0);
  const totalValue = entries.reduce((sum, entry) => sum + Number(entry.kilos || 0) * Number(entry.pricePerKg || 0), 0);
  const saleCount = entries.filter((entry) => ["Myyntiin", "Tukkuun", "Jalostukseen"].includes(entry.destination)).length;

  return (
    <div style={styles.grid2}>
      <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
        <strong>Excel-raportit</strong>
        <div style={styles.noticeInfo}>Raportit ladataan CSV-muodossa, joka aukeaa suoraan Excelissä.</div>
        <button
          style={{ ...styles.button, ...styles.primaryButton }}
          onClick={() => exportCsv(`saaliit-${today()}.csv`, [["Päivä", "Kirjaaja", "Vesialue", "Pyyntipaikka", "Laji", "Kg", "Kpl", "Pyydys", "Pyydysten määrä", "Käyttötarkoitus", "Ostaja", "Hinta €/kg", "Arvo €", "Toimitustapa", "Toimitusalue", "Toimituskustannus €", "Aikaisin toimitus", "Kylmäkuljetus", "Lisätiedot"], ...reportRows])}
        >
          Lataa saalisraportti Exceliin
        </button>
        <button
          style={styles.button}
          onClick={() => exportCsv(`tarjoukset-${today()}.csv`, [["Pvm", "Yritys", "Yhteyshenkilö", "Sähköposti", "Puhelin", "Tarjous €/kg", "Tila", "Viesti"], ...offerRows])}
        >
          Lataa tarjousraportti Exceliin
        </button>
      </div>

      <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
        <strong>Raporttiyhteenveto</strong>
        <div style={styles.entryBadges}>
          <span style={styles.badge}>{totalKg.toFixed(1)} kg yhteensä</span>
          <span style={styles.badge}>{euro(totalValue)} arvo</span>
          <span style={styles.badge}>{saleCount} myyntierää</span>
          <span style={styles.badge}>{offers.length} tarjousta</span>
        </div>
        <div style={styles.muted}>Raportit sisältävät kaikki tällä hetkellä näkyvät saaliit ja tarjoukset.</div>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [entries, setEntries] = useState([]);
  const [offers, setOffers] = useState([]);
  const [buyerOffers, setBuyerOffers] = useState([]);
  const [buyerOffersFilter, setBuyerOffersFilter] = useState("open");
  const [buyerOffersSearch, setBuyerOffersSearch] = useState("");
  const [buyerActiveOfferId, setBuyerActiveOfferId] = useState(null);
  const [allowedUsers, setAllowedUsers] = useState([]);
  const [buyers, setBuyers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [entryScope, setEntryScope] = useState("own");
  const [authMode, setAuthMode] = useState("signin");
  const [authForm, setAuthForm] = useState({ email: "", password: "", displayName: "" });
  const [authError, setAuthError] = useState("");
  const [authInfo, setAuthInfo] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [form, setForm] = useState({
    date: today(),
    area: "Suur-Saimaa",
    spot: "",
    gear: "Rysä",
    gearCount: "",
    destination: "Myyntiin",
    buyer: "",
    pricePerKg: "",
    notes: "",
    offerToShops: false,
    offerToRestaurants: false,
    offerToWholesalers: false,
    deliveryMethod: "Nouto",
    deliveryArea: "",
    deliveryCost: "",
    earliestDeliveryDate: today(),
    coldTransport: false,
  });
  const [speciesRows, setSpeciesRows] = useState([createSpeciesRow()]);
  const [newAllowedForm, setNewAllowedForm] = useState({ email: "", displayName: "", role: "member" });
  const [buyerAction, setBuyerAction] = useState({ counter_price_per_kg: "", reserved_kilos: "", buyer_message: "" });
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
  });

  const buyerTypeLabel = (type) => {
    if (type === "ravintola") return "Anonyymi ravintola";
    if (type === "tukku") return "Anonyymi tukku";
    if (type === "kauppa") return "Anonyymi kauppa";
    return "Anonyymi ostaja";
  };

  const buyerStatusLabel = (status) => {
    if (status === "sent") return "Tarjous lähetetty";
    if (status === "viewed") return "Avattu";
    if (status === "countered") return "Vastatarjous";
    if (status === "reserved") return "Varattu";
    if (status === "accepted") return "Hyväksytty";
    if (status === "rejected") return "Hylätty";
    if (status === "cancelled") return "Peruttu";
    return status || "-";
  };

  const shouldRevealBuyerIdentity = (status) => status === "accepted";

  const shouldSendOffer = form.offerToShops || form.offerToRestaurants || form.offerToWholesalers;

  const buildOfferRecipients = (offerFormState, rows) => {
    const totalKilos = rows.reduce((sum, row) => sum + Number(row.kilos || 0), 0);
    const selectedTypes = [];
    if (offerFormState.offerToShops) selectedTypes.push("kauppa");
    if (offerFormState.offerToRestaurants) selectedTypes.push("ravintola");
    if (offerFormState.offerToWholesalers) selectedTypes.push("tukku");

    return buyers
      .filter((buyer) => buyer.is_active)
      .filter((buyer) => selectedTypes.includes(buyer.buyer_type))
      .filter((buyer) => {
        const minKg = buyer.min_kg == null || buyer.min_kg === "" ? null : Number(buyer.min_kg);
        const maxKg = buyer.max_kg == null || buyer.max_kg === "" ? null : Number(buyer.max_kg);

        if (buyer.buyer_type === "tukku") {
          return minKg == null || totalKilos >= minKg;
        }
        if (buyer.buyer_type === "ravintola") {
          return maxKg == null || totalKilos <= maxKg;
        }
        if (buyer.buyer_type === "kauppa") {
          const minOk = minKg == null || totalKilos >= minKg;
          const maxOk = maxKg == null || totalKilos <= maxKg;
          return minOk && maxOk;
        }
        return false;
      })
      .map((buyer) => ({
        buyer_id: buyer.id,
        email: buyer.email,
        channel: buyer.buyer_type,
        company_name: buyer.company_name,
        contact_name: buyer.contact_name,
      }))
      .filter((recipient, index, array) => index === array.findIndex((item) => item.email === recipient.email));
  };

  const invalidateSession = async (message = "Istunto on vanhentunut. Kirjaudu uudelleen sisään.") => {
    await clearBrokenSession();
    setSession(null);
    setProfile(null);
    setEntries([]);
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
        const { data, error } = await supabase.auth.getSession();
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
      setSession(nextSession ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

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
    if (!session?.user) {
      setProfile(null);
      setEntries([]);
      setOffers([]);
      setAllowedUsers([]);
      return;
    }

    const ensureProfile = async () => {
      const email = session.user.email || "";
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
        setProfile(existingProfile);
        return;
      }
      const { data: allowed, error: allowedError } = await supabase.from("allowed_users").select("*").eq("email", email).maybeSingle();
      if (allowedError && allowedError.code !== "PGRST116") {
        if (isMissingRefreshTokenError(allowedError)) {
          await invalidateSession();
          return;
        }
        setAuthError(allowedError.message);
        return;
      }
      if (!allowed || !allowed.is_active) {
        setAuthError("Sähköpostia ei ole hyväksytty käyttöön.");
        await clearBrokenSession();
        setSession(null);
        return;
      }
      const { data: insertedProfile, error: insertError } = await supabase
        .from("profiles")
        .insert({
          id: session.user.id,
          email,
          display_name: allowed.display_name || session.user.user_metadata?.display_name || email,
          role: allowed.role || "member",
          is_active: allowed.is_active,
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
      setProfile(insertedProfile);
    };

    ensureProfile();
  }, [session]);

  useEffect(() => {
    if (!profile) return;

    const loadData = async () => {
      setAuthError("");

      const entriesQuery = supabase.from("catch_entries").select("*").order("date", { ascending: false }).order("created_at", { ascending: false });
      const finalEntriesQuery = profile.role === "owner" && entryScope === "all" ? entriesQuery : entriesQuery.eq("owner_user_id", profile.id);

      const offerTableExists = async () => {
        const { error } = await supabase.from("wholesale_offers").select("id", { count: "exact", head: true });
        return !error;
      };
      const buyersTableExists = async () => {
        const { error } = await supabase.from("buyers").select("id", { count: "exact", head: true });
        return !error;
      };
      const buyerOffersTableExists = async () => {
        const { error } = await supabase.from("buyer_offers").select("id", { count: "exact", head: true });
        return !error;
      };

      try {
        const hasOffersTable = await offerTableExists();
        const hasBuyersTable = await buyersTableExists();
        const hasBuyerOffersTable = await buyerOffersTableExists();

        const [
          { data: entryData, error: entryError },
          { data: allowedData, error: allowedError },
          offerResult,
          buyersResult,
          buyerOffersResult,
        ] = await Promise.all([
          finalEntriesQuery,
          profile.role === "owner" ? supabase.from("allowed_users").select("*").order("created_at", { ascending: true }) : Promise.resolve({ data: [], error: null }),
          hasOffersTable ? supabase.from("wholesale_offers").select("*").order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
          hasBuyersTable ? supabase.from("buyers").select("*").order("company_name", { ascending: true }) : Promise.resolve({ data: [], error: null }),
          hasBuyerOffersTable ? supabase.from("buyer_offers").select("*").order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
        ]);

        if (entryError) {
          if (isMissingRefreshTokenError(entryError)) {
            await invalidateSession();
            return;
          }
          setAuthError(entryError.message);
        } else {
          setEntries((entryData || []).map((entry) => ({
            id: entry.id,
            batchId: entry.batch_id,
            date: entry.date,
            area: entry.area,
            spot: entry.spot || "",
            species: entry.species,
            kilos: Number(entry.kilos || 0),
            count: Number(entry.count || 0),
            gear: entry.gear,
            gearCount: Number(entry.gear_count || 0),
            destination: entry.destination,
            buyer: entry.buyer || "",
            pricePerKg: Number(entry.price_per_kg || 0),
            notes: entry.notes || "",
            deliveryMethod: entry.delivery_method || "Nouto",
            deliveryArea: entry.delivery_area || "",
            deliveryCost: entry.delivery_cost == null ? "" : Number(entry.delivery_cost),
            earliestDeliveryDate: entry.earliest_delivery_date || "",
            coldTransport: Boolean(entry.cold_transport),
            ownerName: entry.owner_name,
            ownerUserId: entry.owner_user_id,
            offerToShops: Boolean(entry.offer_to_shops),
            offerToRestaurants: Boolean(entry.offer_to_restaurants),
            offerToWholesalers: Boolean(entry.offer_to_wholesalers),
          })));
        }

        if (allowedError) {
          if (isMissingRefreshTokenError(allowedError)) {
            await invalidateSession();
            return;
          }
          setAuthError(allowedError.message);
        } else {
          setAllowedUsers(allowedData || []);
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
          min_kg: buyer.min_kg == null ? "" : Number(buyer.min_kg),
          max_kg: buyer.max_kg == null ? "" : Number(buyer.max_kg),
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
          setBuyerOffers((buyerOffersResult?.data || []).map((offer) => {
            const buyer = buyersData.find((item) => item.id === offer.buyer_id);
            return {
              ...offer,
              total_kilos: Number(offer.total_kilos || 0),
              price_per_kg: offer.price_per_kg == null ? "" : Number(offer.price_per_kg),
              counter_price_per_kg: offer.counter_price_per_kg == null ? "" : Number(offer.counter_price_per_kg),
              reserved_kilos: offer.reserved_kilos == null ? "" : Number(offer.reserved_kilos),
              buyer_type: buyer?.buyer_type || "",
              buyer_company_name: buyer?.company_name || "",
              buyer_contact_name: buyer?.contact_name || "",
              buyer_phone: buyer?.phone || "",
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
  }, [profile, entryScope, refreshTick]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (!q) return true;
      return [entry.species, entry.area, entry.spot, entry.gear, entry.destination, entry.buyer, entry.notes, entry.ownerName].join(" ").toLowerCase().includes(q);
    });
  }, [entries, search]);

  const saleEntries = useMemo(() => entries.filter((entry) => entry.offerToShops || entry.offerToRestaurants || entry.offerToWholesalers), [entries]);

  const totals = useMemo(() => {
    const totalKg = entries.reduce((sum, e) => sum + Number(e.kilos || 0), 0);
    const totalValue = entries.reduce((sum, e) => sum + Number(e.kilos || 0) * Number(e.pricePerKg || 0), 0);
    const totalGearCount = entries.reduce((sum, e) => sum + Number(e.gearCount || 0), 0);
    const catchPerGear = totalGearCount > 0 ? totalKg / totalGearCount : 0;
    const forSaleKg = saleEntries.reduce((sum, e) => sum + Number(e.kilos || 0), 0);
    const speciesSummary = fishSpecies
      .map((species) => ({ species, kilos: entries.filter((e) => e.species === species).reduce((sum, e) => sum + Number(e.kilos || 0), 0) }))
      .filter((item) => item.kilos > 0)
      .sort((a, b) => b.kilos - a.kilos);
    return { totalKg, totalValue, forSaleKg, catchPerGear, speciesSummary };
  }, [entries, saleEntries]);

  const addSpeciesRow = () => setSpeciesRows((prev) => [...prev, createSpeciesRow()]);
  const updateSpeciesRow = (id, field, value) => setSpeciesRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  const removeSpeciesRow = (id) => setSpeciesRows((prev) => (prev.length === 1 ? [createSpeciesRow()] : prev.filter((row) => row.id !== id)));
  const duplicateSpeciesRow = (id) => setSpeciesRows((prev) => {
    const row = prev.find((item) => item.id === id);
    if (!row) return prev;
    const copy = { ...row, id: safeId() };
    const index = prev.findIndex((item) => item.id === id);
    return [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)];
  });

  const handleSignIn = async () => {
    setAuthError("");
    setAuthInfo("");
    const email = authForm.email.trim().toLowerCase();
    const password = authForm.password;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setAuthError("Väärä sähköposti tai salasana – tai käyttäjää ei ole vielä rekisteröity.");
    }
  };

  const handleSignUp = async () => {
    setAuthError("");
    setAuthInfo("");
    const email = authForm.email.trim().toLowerCase();
    const password = authForm.password;
    const displayName = authForm.displayName.trim();
    if (!email || !password || !displayName) {
      setAuthError("Täytä sähköposti, salasana ja nimi.");
      return;
    }
    const { data: allowed, error: allowedError } = await supabase.from("allowed_users").select("*").eq("email", email).maybeSingle();
    if (allowedError && allowedError.code !== "PGRST116") {
      if (isMissingRefreshTokenError(allowedError)) {
        await invalidateSession();
        return;
      }
      setAuthError(allowedError.message);
      return;
    }
    if (!allowed || !allowed.is_active) {
      setAuthError("Tätä sähköpostia ei ole vielä lisätty sallittuihin käyttäjiin.");
      return;
    }
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } });
    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setAuthError(error.message);
      return;
    }
    setAuthInfo("Tunnus luotu. Kirjaudu nyt sisään.");
    setAuthMode("signin");
  };

  const handleLogout = async () => {
    await clearBrokenSession();
    setProfile(null);
    setSession(null);
  };

  const handleCreateAllowedUser = async () => {
    if (!profile || profile.role !== "owner") return;
    setUserMessage("");
    const email = newAllowedForm.email.trim().toLowerCase();
    const displayName = newAllowedForm.displayName.trim();
    if (!email || !displayName) {
      setUserMessage("Täytä sähköposti ja nimi.");
      return;
    }
    const role = newAllowedForm.role === "owner" ? "owner" : newAllowedForm.role === "buyer" ? "buyer" : "member";
    const { error } = await supabase.from("allowed_users").insert({
      email,
      display_name: displayName,
      role,
      is_active: true,
    });
    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setUserMessage(error.message);
      return;
    }
    setNewAllowedForm({ email: "", displayName: "", role: "member" });
    setUserMessage(`Sallittu käyttäjä ${displayName} lisätty.`);
    setRefreshTick((prev) => prev + 1);
  };

  const resetBuyerForm = () => {
    setBuyerForm({
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
    });
  };

  const startEditBuyer = (buyer) => {
    setBuyerForm({
      id: buyer.id,
      company_name: buyer.company_name || "",
      buyer_type: buyer.buyer_type || "ravintola",
      contact_name: buyer.contact_name || "",
      email: buyer.email || "",
      phone: buyer.phone || "",
      city: buyer.city || "",
      min_kg: buyer.min_kg === "" || buyer.min_kg == null ? "" : String(buyer.min_kg),
      max_kg: buyer.max_kg === "" || buyer.max_kg == null ? "" : String(buyer.max_kg),
      is_active: Boolean(buyer.is_active),
      notes: buyer.notes || "",
    });
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

  const handleSaveBuyer = async () => {
    if (!profile || profile.role !== "owner") return;
    const payload = {
      company_name: buyerForm.company_name.trim(),
      buyer_type: buyerForm.buyer_type,
      contact_name: buyerForm.contact_name.trim(),
      email: buyerForm.email.trim().toLowerCase(),
      phone: buyerForm.phone.trim(),
      city: buyerForm.city.trim(),
      min_kg: buyerForm.min_kg === "" ? null : Number(buyerForm.min_kg),
      max_kg: buyerForm.max_kg === "" ? null : Number(buyerForm.max_kg),
      is_active: buyerForm.is_active,
      notes: buyerForm.notes.trim(),
    };

    if (!payload.company_name || !payload.email) {
      setUserMessage("Täytä ostajalle vähintään yritys ja sähköposti.");
      return;
    }

    let error;
    if (buyerForm.id) {
      const result = await supabase.from("buyers").update(payload).eq("id", buyerForm.id);
      error = result.error;
    } else {
      const result = await supabase.from("buyers").insert(payload);
      error = result.error;
    }

    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setUserMessage(error.message);
      return;
    }

    resetBuyerForm();
    setUserMessage(buyerForm.id ? "Ostajan tiedot päivitetty." : "Ostaja lisätty.");
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

  const sendCatchOfferEmail = async ({ formState, rows, profileState, batchId }) => {
    const recipients = buildOfferRecipients(formState, rows);
    if (recipients.length === 0) {
      return { skipped: true, sent: [], failed: [] };
    }

    const summaryLines = rows
      .map((row) => {
        const kilos = Number(row.kilos || 0);
        const count = Number(row.count || 0);
        return `${row.species}: ${kilos} kg${count > 0 ? ` (${count} kpl)` : ""}`;
      })
      .join(String.fromCharCode(10));

    const totalKilos = rows.reduce((sum, row) => sum + Number(row.kilos || 0), 0);
    const offerUrlBase = typeof window !== "undefined" ? window.location.origin : "https://suoraan-kalastajalta.vercel.app";
    const logisticsLines = [
      `Toimitustapa: ${formState.deliveryMethod || "-"}`,
      `Toimitusalue: ${formState.deliveryArea || "-"}`,
      `Toimituskustannus: ${formState.deliveryCost !== "" ? `${formState.deliveryCost} €` : "-"}`,
      `Aikaisin toimitus: ${formState.earliestDeliveryDate || "-"}`,
      `Kylmäkuljetus: ${formState.coldTransport ? "Kyllä" : "Ei"}`,
    ];

    const entry = {
      species: rows.map((row) => row.species).join(", "),
      kilos: totalKilos,
      date: formState.date,
      area: formState.area,
      spot: formState.spot || "",
      gear: formState.gear || "",
      gearCount: Number(formState.gearCount || 0),
      pricePerKg: Number(formState.pricePerKg || 0),
      ownerName: profileState?.display_name || profileState?.email || "Tuntematon",
      deliveryMethod: formState.deliveryMethod || "Nouto",
      deliveryArea: formState.deliveryArea || "",
      deliveryCost: formState.deliveryCost === "" ? null : Number(formState.deliveryCost),
      earliestDeliveryDate: formState.earliestDeliveryDate || "",
      coldTransport: Boolean(formState.coldTransport),
      notes: [formState.notes || "", "", "Erän lajit:", summaryLines, "", "Toimitus:", ...logisticsLines].join(String.fromCharCode(10)).trim(),
      offerUrlBase,
    };

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
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
          gear_count: entry.gearCount,
          price_per_kg: entry.pricePerKg || null,
          notes: entry.notes || null,
          status: "sent",
        })
        .select("id")
        .single();

      const offerId = insertedOffer?.data?.id || null;

      const response = await fetch(`${SUPABASE_URL}/functions/v1/send-catch-offer-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: accessToken ? `Bearer ${accessToken}` : `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          entry,
          recipients: [{
            email: recipient.email,
            company_name: recipient.company_name,
            offer_id: offerId,
            offer_link: offerId ? `${offerUrlBase}?offer=${offerId}` : null,
          }],
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok) {
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
        failed.push({
          company_name: recipient.company_name,
          contact_name: recipient.contact_name,
          email: recipient.email,
          channel: recipient.channel,
          error: data?.error || `Tarjoussähköpostin lähetys epäonnistui (${response.status})`,
        });
      }
    }

    if (failed.length > 0 && sent.length === 0) {
      throw new Error(failed.map((item) => `${item.company_name}: ${item.error}`).join(" | "));
    }

    return { skipped: false, sent, failed };
  };

  const refreshBuyerOffers = async () => {
    const { data, error } = await supabase.from("buyer_offers").select("*").order("created_at", { ascending: false });
    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setAuthError(error.message);
      return;
    }
    setBuyerOffers((data || []).map((offer) => {
      const buyer = buyers.find((item) => item.id === offer.buyer_id);
      return {
        ...offer,
        total_kilos: Number(offer.total_kilos || 0),
        price_per_kg: offer.price_per_kg == null ? "" : Number(offer.price_per_kg),
        counter_price_per_kg: offer.counter_price_per_kg == null ? "" : Number(offer.counter_price_per_kg),
        reserved_kilos: offer.reserved_kilos == null ? "" : Number(offer.reserved_kilos),
        buyer_type: buyer?.buyer_type || "",
        buyer_company_name: buyer?.company_name || "",
        buyer_contact_name: buyer?.contact_name || "",
        buyer_phone: buyer?.phone || "",
      };
    }));
  };

  const buyerUpdateOffer = async (offerId, patch) => {
    const { error } = await supabase.from("buyer_offers").update(patch).eq("id", offerId);
    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return false;
      }
      setAuthError(error.message);
      return false;
    }
    await refreshBuyerOffers();
    setRefreshTick((prev) => prev + 1);
    return true;
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

    await fetch(`${SUPABASE_URL}/functions/v1/send-buyer-response-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: accessToken ? `Bearer ${accessToken}` : `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({
        sellerEmail,
        offerLink: typeof window !== "undefined" ? `${window.location.origin}?offer=${offer.id}` : null,
        offer: {
          buyerLabel,
          buyerEmail: revealIdentity ? offer?.buyer_email : null,
          buyerPhone: revealIdentity ? offer?.buyer_phone : null,
          species_summary: offer?.species_summary,
          total_kilos: offer?.total_kilos,
          area: offer?.area,
          spot: offer?.spot,
          price_per_kg: offer?.price_per_kg,
          counter_price_per_kg: offer?.counter_price_per_kg,
          reserved_kilos: offer?.reserved_kilos,
          buyer_message: offer?.buyer_message,
          status: offer?.status,
          actionLabel,
        },
      }),
    }).catch(() => null);
  };

  const onSubmitCounter = async (offer) => {
    const price = buyerAction.counter_price_per_kg === "" ? null : Number(buyerAction.counter_price_per_kg);
    const msg = buyerAction.buyer_message?.trim() || null;
    const ok = await buyerUpdateOffer(offer.id, {
      status: "countered",
      counter_price_per_kg: price,
      buyer_message: msg,
    });
    if (ok) {
      const updatedOffer = { ...offer, status: "countered", counter_price_per_kg: price, buyer_message: msg };
      await sendBuyerResponseEmail(updatedOffer, "Ostaja teki vastatarjouksen");
      setAuthInfo("Vastatarjous lähetetty myyjälle.");
      setBuyerAction({ counter_price_per_kg: "", reserved_kilos: "", buyer_message: "" });
      setBuyerActiveOfferId(null);
    }
  };

  const onReserve = async (offer) => {
    const reserved = buyerAction.reserved_kilos === "" ? Number(offer.total_kilos || 0) : Number(buyerAction.reserved_kilos);
    const msg = buyerAction.buyer_message?.trim() || null;
    const ok = await buyerUpdateOffer(offer.id, {
      status: "reserved",
      reserved_kilos: reserved,
      buyer_message: msg,
    });
    if (ok) {
      const updatedOffer = { ...offer, status: "reserved", reserved_kilos: reserved, buyer_message: msg };
      await sendBuyerResponseEmail(updatedOffer, "Ostaja varasi erän");
      setAuthInfo("Erä varattu. Myyjälle näkyy varaus.");
      setBuyerAction({ counter_price_per_kg: "", reserved_kilos: "", buyer_message: "" });
      setBuyerActiveOfferId(null);
    }
  };

  const onRejectBuyerOffer = async (offer) => {
    const ok = await buyerUpdateOffer(offer.id, { status: "rejected" });
    if (ok) {
      await sendBuyerResponseEmail({ ...offer, status: "rejected" }, "Ostaja hylkäsi tarjouksen");
      setAuthInfo("Tarjous hylätty.");
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
      offer_price_per_kg: Number(offerForm.offer_price_per_kg || 0),
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

  const handleSave = async () => {
    if (!profile) return;
    const validRows = speciesRows.filter((row) => Number(row.kilos || 0) > 0);
    if (!validRows.length) return;
    setSaving(true);
    const batchId = new Date().toISOString();
    const payload = validRows.map((row) => ({
      offer_to_shops: form.offerToShops,
      offer_to_restaurants: form.offerToRestaurants,
      offer_to_wholesalers: form.offerToWholesalers,
      date: form.date,
      area: form.area,
      spot: form.spot,
      species: row.species,
      kilos: Number(row.kilos || 0),
      count: Number(row.count || 0),
      gear: form.gear,
      gear_count: Number(form.gearCount || 0),
      destination: form.destination,
      buyer: form.buyer,
      price_per_kg: Number(form.pricePerKg || defaultFishPrices[row.species] || 0),
      delivery_method: form.deliveryMethod,
      delivery_area: form.deliveryArea,
      delivery_cost: form.deliveryCost === "" ? null : Number(form.deliveryCost),
      earliest_delivery_date: form.earliestDeliveryDate || null,
      cold_transport: form.coldTransport,
      notes: form.notes,
      batch_id: batchId,
      owner_user_id: profile.id,
      owner_name: profile.display_name,
    }));

    const { error } = await supabase.from("catch_entries").insert(payload);
    if (error) {
      setSaving(false);
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setAuthError(error.message);
      return;
    }

    try {
      const emailResult = await sendCatchOfferEmail({
        formState: form,
        rows: validRows,
        profileState: profile,
        batchId,
      });

      if (shouldSendOffer) {
        if (emailResult.skipped) {
          setAuthInfo("Saalis tallennettu, mutta yhtään ostajaa ei täyttänyt tarjousehtoja.");
        } else {
          const sentLines = emailResult.sent.map((item) => `✔ ${item.company_name} (${item.email})`);
          const failedLines = emailResult.failed.map((item) => `✖ ${item.company_name} (${item.email}) – ${item.error}`);
          const parts = [`Saalis tallennettu. Tarjous lähetetty ${emailResult.sent.length} ostajalle.`];
          if (sentLines.length > 0) parts.push("", "Lähetetty:", ...sentLines);
          if (failedLines.length > 0) parts.push("", "Epäonnistui:", ...failedLines);
          setAuthInfo(parts.join(String.fromCharCode(10)));
        }
      } else {
        setAuthInfo("Saalis tallennettu.");
      }
    } catch (emailError) {
      console.error("Sähköpostin lähetys epäonnistui:", emailError);
      setAuthInfo("Saalis tallennettu, mutta tarjoussähköpostin lähetys epäonnistui.");
    }

    setSaving(false);
    setForm((prev) => ({
      ...prev,
      buyer: "",
      pricePerKg: "",
      notes: "",
      date: today(),
      offerToShops: false,
      offerToRestaurants: false,
      offerToWholesalers: false,
      deliveryMethod: "Nouto",
      deliveryArea: "",
      deliveryCost: "",
      earliestDeliveryDate: today(),
      coldTransport: false,
    }));
    setSpeciesRows([createSpeciesRow()]);
    setRefreshTick((prev) => prev + 1);
    setActiveTab("entries");
  };

  const handleDeleteEntry = async (entry) => {
    const ok = window.confirm(`Poistetaanko saalistieto: ${entry.species} ${entry.kilos} kg / ${entry.date}?`);
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

  if (loading) {
    return <div style={styles.app}><div style={styles.container}><div style={{ ...styles.card, ...styles.sectionCard }}>Ladataan...</div></div></div>;
  }

  if (!session || !profile) {
    return <AuthView authMode={authMode} setAuthMode={setAuthMode} authForm={authForm} setAuthForm={setAuthForm} onSignIn={handleSignIn} onSignUp={handleSignUp} authError={authError} authInfo={authInfo} />;
  }

  if (profile.role === "buyer") {
    const filteredBuyerOffers = buyerOffers.filter((offer) => {
      const q = buyerOffersSearch.trim().toLowerCase();
      const statusOk = buyerOffersFilter === "all" ? true : buyerOffersFilter === "open" ? ["sent", "viewed", "countered"].includes(offer.status) : offer.status === buyerOffersFilter;
      const text = [offer.seller_name, offer.area, offer.spot, offer.species_summary, offer.status, offer.buyer_message].filter(Boolean).join(" ").toLowerCase();
      return statusOk && (!q || text.includes(q));
    });

    return (
      <div style={styles.app}>
        <div style={styles.container}>
          <div style={{ ...styles.card, ...styles.headerCard }}>
            <div style={styles.rowBetween}>
              <div>
                <h1 style={styles.title}>Suoraan Kalastajalta</h1>
                <p style={styles.subtitle}>Ostaja: <strong>{profile.display_name}</strong></p>
              </div>
              <div style={styles.toolbar}>
                <button style={styles.button} onClick={() => setRefreshTick((prev) => prev + 1)}>Päivitä</button>
                <button style={styles.button} onClick={handleLogout}>Kirjaudu ulos</button>
              </div>
            </div>
          </div>

          {authError ? <div style={{ ...styles.noticeError, marginBottom: 16 }}>{authError}</div> : null}
          {authInfo ? <div style={{ ...styles.noticeSuccess, marginBottom: 16 }}>{authInfo}</div> : null}

          <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
            <div style={styles.rowBetween}>
              <strong>Minulle tarjotut erät</strong>
              <div style={styles.row}>
                <select style={styles.input} value={buyerOffersFilter} onChange={(e) => setBuyerOffersFilter(e.target.value)}>
                  <option value="open">Avoimet</option>
                  <option value="reserved">Varatut</option>
                  <option value="accepted">Hyväksytyt</option>
                  <option value="rejected">Hylätyt</option>
                  <option value="all">Kaikki</option>
                </select>
                <input style={{ ...styles.input, width: 320 }} placeholder="Hae myyjällä, alueella, lajilla..." value={buyerOffersSearch} onChange={(e) => setBuyerOffersSearch(e.target.value)} />
              </div>
            </div>

            {filteredBuyerOffers.length === 0 ? <div style={styles.muted}>Ei tarjottuja eriä.</div> : filteredBuyerOffers.map((o) => {
              const isActive = buyerActiveOfferId === o.id;
              return (
                <div key={o.id} style={styles.entry}>
                  <div style={styles.entryHeader}>
                    <div>
                      <div style={styles.entryBadges}>
                        <span style={styles.badge}>{buyerStatusLabel(o.status)}</span>
                        <span style={styles.badge}>{o.total_kilos} kg</span>
                        {o.price_per_kg !== "" && o.price_per_kg != null ? <span style={styles.badge}>{euro(o.price_per_kg)} / kg</span> : null}
                        <span style={styles.badge}>{o.area || "-"}</span>
                        {o.seller_name ? <span style={styles.badge}>Myyjä: {o.seller_name}</span> : null}
                      </div>
                      <div style={styles.muted}>{o.species_summary || "-"}</div>
                      {o.spot ? <div style={styles.muted}>Paikka: {o.spot}</div> : null}
                      {o.notes ? <div style={styles.muted} style={{ color: "#64748b", whiteSpace: "pre-wrap" }}>{o.notes}</div> : null}
                      {o.buyer_message ? <div style={styles.muted}>Sinun viesti: {o.buyer_message}</div> : null}
                    </div>
                    <div style={styles.row}>
                      <button style={styles.button} onClick={() => setBuyerActiveOfferId(isActive ? null : o.id)}>{isActive ? "Sulje" : "Tee vastatarjous / varaa"}</button>
                      <button style={styles.button} onClick={() => onRejectBuyerOffer(o)}>Hylkää</button>
                    </div>
                  </div>

                  {isActive ? (
                    <div style={{ ...styles.stack, marginTop: 12 }}>
                      <div style={styles.field}><label>Vastatarjous €/kg</label><input style={styles.input} type="number" value={buyerAction.counter_price_per_kg} onChange={(e) => setBuyerAction((p) => ({ ...p, counter_price_per_kg: e.target.value }))} placeholder="Esim. 5.80" /></div>
                      <div style={styles.field}><label>Varaa kg (tyhjä = koko erä)</label><input style={styles.input} type="number" value={buyerAction.reserved_kilos} onChange={(e) => setBuyerAction((p) => ({ ...p, reserved_kilos: e.target.value }))} placeholder={`Max ${o.total_kilos}`} /></div>
                      <div style={styles.field}><label>Viesti myyjälle</label><textarea style={styles.textarea} value={buyerAction.buyer_message} onChange={(e) => setBuyerAction((p) => ({ ...p, buyer_message: e.target.value }))} placeholder="Toimitus, nouto, aikataulu..." /></div>
                      <div style={styles.row}>
                        <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => onSubmitCounter(o)}>Lähetä vastatarjous</button>
                        <button style={styles.button} onClick={() => onReserve(o)}>Varaa erä</button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const tabStyle = profile.role === "owner" ? styles.tabs : styles.tabs6;
  const grid3 = responsiveGridStyle(styles.grid3);
  const grid2 = responsiveGridStyle(styles.grid2);
  const formGrid = responsiveGridStyle(styles.formGrid);
  const speciesRow = responsiveGridStyle(styles.speciesRow);

  return (
    <div style={styles.app}>
      <div style={styles.container}>
        <div style={{ ...styles.card, ...styles.headerCard }}>
          <div style={styles.rowBetween}>
            <div>
              <h1 style={styles.title}>Suoraan Kalastajalta</h1>
              <p style={styles.subtitle}>Kirjautunut: <strong>{profile.display_name}</strong> · rooli: {profile.role === "owner" ? "omistaja" : profile.role === "buyer" ? "ostaja" : "käyttäjä"}</p>
            </div>
            <div style={styles.toolbar}>
              {profile.role === "owner" ? (
                <select style={styles.input} value={entryScope} onChange={(e) => setEntryScope(e.target.value)}>
                  <option value="own">Näytä vain omat</option>
                  <option value="all">Näytä kaikkien saaliit</option>
                </select>
              ) : null}
              <span style={styles.badge}>{totals.totalKg.toFixed(1)} kg yhteensä</span>
              <span style={styles.badge}>{euro(totals.totalValue)} arvo</span>
              <span style={styles.badge}>{totals.catchPerGear.toFixed(1)} kg / pyydys</span>
              <button style={styles.button} onClick={() => setRefreshTick((prev) => prev + 1)}>Päivitä</button>
              <button style={styles.button} onClick={handleLogout}>Kirjaudu ulos</button>
            </div>
          </div>
        </div>

        {authError ? <div style={{ ...styles.noticeError, marginBottom: 16 }}>{authError}</div> : null}
        {authInfo ? <div style={{ ...styles.noticeSuccess, marginBottom: 16 }}>{authInfo}</div> : null}

        <div style={tabStyle}>
          <button style={{ ...styles.tab, ...(activeTab === "dashboard" ? styles.activeTab : {}) }} onClick={() => setActiveTab("dashboard")}>Yhteenveto</button>
          <button style={{ ...styles.tab, ...(activeTab === "add" ? styles.activeTab : {}) }} onClick={() => setActiveTab("add")}>Lisää saalis</button>
          <button style={{ ...styles.tab, ...(activeTab === "entries" ? styles.activeTab : {}) }} onClick={() => setActiveTab("entries")}>Saaliit</button>
          <button style={{ ...styles.tab, ...(activeTab === "offers" ? styles.activeTab : {}) }} onClick={() => setActiveTab("offers")}>Tarjoukset</button>
          <button style={{ ...styles.tab, ...(activeTab === "reports" ? styles.activeTab : {}) }} onClick={() => setActiveTab("reports")}>Raportit</button>
          {profile.role === "owner" ? <button style={{ ...styles.tab, ...(activeTab === "buyers" ? styles.activeTab : {}) }} onClick={() => setActiveTab("buyers")}>Ostajat</button> : null}
          {profile.role === "owner" ? <button style={{ ...styles.tab, ...(activeTab === "users" ? styles.activeTab : {}) }} onClick={() => setActiveTab("users")}>Käyttäjät</button> : null}
        </div>

        {activeTab === "dashboard" ? (
          <div style={styles.stack}>
            <div style={grid3}>
              <div style={{ ...styles.card, ...styles.sectionCard }}><div style={styles.metric}>{totals.totalKg.toFixed(1)} kg</div><div style={styles.muted}>Kokonaissaalis</div></div>
              <div style={{ ...styles.card, ...styles.sectionCard }}><div style={styles.metric}>{euro(totals.totalValue)}</div><div style={styles.muted}>Arvioitu myyntiarvo</div></div>
              <div style={{ ...styles.card, ...styles.sectionCard }}><div style={styles.metric}>{totals.forSaleKg.toFixed(1)} kg</div><div style={styles.muted}>Myytävissä / jalostukseen</div></div>
            </div>
            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
              <strong>Lajikohtainen yhteenveto</strong>
              {totals.speciesSummary.length === 0 ? <div style={styles.muted}>Ei vielä saalistietoja.</div> : totals.speciesSummary.map((item) => (
                <div key={item.species} style={{ ...styles.stack, gap: 6 }}>
                  <div style={styles.rowBetween}><span>{item.species}</span><span>{item.kilos.toFixed(1)} kg</span></div>
                  <div style={styles.progress}><span style={{ ...styles.progressFill, width: `${Math.max((item.kilos / Math.max(totals.totalKg, 1)) * 100, 4)}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {activeTab === "add" ? (
          <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
            <div style={formGrid}>
              <div style={styles.field}><label>Päivämäärä</label><input style={styles.input} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
              <div style={styles.field}><label>Vesialue</label><select style={styles.input} value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}>{defaultAreas.map((area) => <option key={area} value={area}>{area}</option>)}</select></div>
              <div style={styles.field}><label>Pyyntipaikka</label><select style={styles.input} value={form.spot} onChange={(e) => setForm({ ...form, spot: e.target.value })}><option value="">Valitse pyyntipaikka</option>{fishingSpots.map((spot) => <option key={spot.name} value={spot.name}>{spot.name}</option>)}</select></div>
              <div style={styles.field}><label>Kirjaaja</label><input style={styles.input} value={profile.display_name} disabled /></div>
              <div style={{ ...styles.field, ...styles.fieldFull, ...styles.speciesBox, ...styles.stack }}>
                <div style={styles.rowBetween}><div><label>Kalalajit samasta tarkastuskerrasta</label><div style={styles.small}>Lisää yhdellä kertaa kaikki lajit, jotka tulivat samoista pyydyksistä.</div></div><button style={styles.button} type="button" onClick={addSpeciesRow}>Lisää laji</button></div>
                {speciesRows.map((row, index) => (
                  <div key={row.id} style={speciesRow}>
                    <div style={styles.field}><label>Laji {index + 1}</label><select style={styles.input} value={row.species} onChange={(e) => updateSpeciesRow(row.id, "species", e.target.value)}>{fishSpecies.map((species) => <option key={species} value={species}>{species}</option>)}</select></div>
                    <div style={styles.field}><label>Kg</label><input style={styles.input} type="number" placeholder="0" value={row.kilos} onChange={(e) => updateSpeciesRow(row.id, "kilos", e.target.value)} /></div>
                    <div style={styles.field}><label>Kpl</label><input style={styles.input} type="number" placeholder="0" value={row.count} onChange={(e) => updateSpeciesRow(row.id, "count", e.target.value)} /></div>
                    <div style={styles.row}><button style={styles.button} type="button" onClick={() => duplicateSpeciesRow(row.id)}>Kopioi</button><button style={styles.button} type="button" onClick={() => removeSpeciesRow(row.id)}>Poista</button></div>
                  </div>
                ))}
              </div>
              <div style={styles.field}><label>Pyydys</label><select style={styles.input} value={form.gear} onChange={(e) => setForm({ ...form, gear: e.target.value })}>{gearTypes.map((gear) => <option key={gear} value={gear}>{gear}</option>)}</select></div>
              <div style={styles.field}><label>Pyydysten määrä</label><input style={styles.input} type="number" placeholder="Esim. 4" value={form.gearCount} onChange={(e) => setForm({ ...form, gearCount: e.target.value })} /></div>
              <div style={styles.field}><label>Käyttötarkoitus</label><select style={styles.input} value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })}>{destinations.map((d) => <option key={d} value={d}>{d}</option>)}</select></div>
              <div style={styles.field}><label>Ostaja</label><input style={styles.input} placeholder="Esim. Forelli / tukku" value={form.buyer} onChange={(e) => setForm({ ...form, buyer: e.target.value })} /></div>
              <div style={styles.field}><label>Hinta €/kg</label><input style={styles.input} type="number" placeholder="Tyhjä = oletushinta" value={form.pricePerKg} onChange={(e) => setForm({ ...form, pricePerKg: e.target.value })} /></div>
              <div style={styles.field}><label>Toimitustapa</label><select style={styles.input} value={form.deliveryMethod} onChange={(e) => setForm({ ...form, deliveryMethod: e.target.value })}>{deliveryMethods.map((method) => <option key={method} value={method}>{method}</option>)}</select></div>
              <div style={styles.field}><label>Toimitusalue</label><input style={styles.input} placeholder="Esim. Etelä-Suomi / Helsinki / koko Suomi" value={form.deliveryArea} onChange={(e) => setForm({ ...form, deliveryArea: e.target.value })} /></div>
              <div style={styles.field}><label>Toimituskustannus €</label><input style={styles.input} type="number" placeholder="Esim. 90" value={form.deliveryCost} onChange={(e) => setForm({ ...form, deliveryCost: e.target.value })} /></div>
              <div style={styles.field}><label>Aikaisin toimitus</label><input style={styles.input} type="date" value={form.earliestDeliveryDate} onChange={(e) => setForm({ ...form, earliestDeliveryDate: e.target.value })} /></div>
              <div style={styles.field}><label><input type="checkbox" checked={form.coldTransport} onChange={(e) => setForm({ ...form, coldTransport: e.target.checked })} /> Kylmäkuljetus</label></div>
              <div style={{ ...styles.field, ...styles.fieldFull }}>
                <label>Tarjoa erää myyntiin</label>
                <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                  <label><input type="checkbox" checked={form.offerToShops} onChange={(e) => setForm({ ...form, offerToShops: e.target.checked })} /> Kauppoihin</label>
                  <label><input type="checkbox" checked={form.offerToRestaurants} onChange={(e) => setForm({ ...form, offerToRestaurants: e.target.checked })} /> Ravintoloihin</label>
                  <label><input type="checkbox" checked={form.offerToWholesalers} onChange={(e) => setForm({ ...form, offerToWholesalers: e.target.checked })} /> Tukkuihin</label>
                </div>
              </div>
              <div style={{ ...styles.field, ...styles.fieldFull }}><label>Lisätiedot</label><textarea style={styles.textarea} placeholder="Esim. laatu, jäähdytys, toimitus, huomioita" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <div style={{ ...styles.row, justifyContent: "flex-end" }}><button style={{ ...styles.button, ...styles.primaryButton }} onClick={handleSave} disabled={saving}>{saving ? "Tallennetaan..." : shouldSendOffer ? "Tallenna saalis ja lähetä tarjous" : "Tallenna saalis"}</button></div>
          </div>
        ) : null}

        {activeTab === "entries" ? (
          <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
            <div style={styles.rowBetween}><strong>{profile.role === "owner" && entryScope === "all" ? "Kaikkien saaliit" : "Omat saaliit"}</strong><input style={{ ...styles.input, maxWidth: 360 }} placeholder="Hae lajilla, paikalla, pyydyksellä..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            {filteredEntries.length === 0 ? <div style={styles.muted}>Ei hakutuloksia.</div> : filteredEntries.map((entry) => (
              <div key={entry.id} style={styles.entry}>
                <div style={styles.entryHeader}>
                  <div>
                    <div style={styles.entryBadges}>
                      <span style={styles.badge}>{entry.species}</span>
                      <span style={styles.badge}>{entry.kilos} kg</span>
                      <span style={styles.badge}>{entry.gear}</span>
                      {entry.gearCount > 0 ? <span style={styles.badge}>{entry.gearCount} pyydystä</span> : null}
                      {entry.gearCount > 0 ? <span style={styles.badge}>{(Number(entry.kilos || 0) / Number(entry.gearCount)).toFixed(1)} kg / pyydys</span> : null}
                      <span style={styles.badge}>{entry.destination}</span>
                      <span style={styles.badge}>{entry.ownerName}</span>
                    </div>
                    <div style={styles.muted}>{entry.date} · {entry.area}{entry.spot ? ` / ${entry.spot}` : ""}</div>
                    <div style={styles.muted}>Ostaja: {entry.buyer || "-"} · Arvo: {euro(Number(entry.kilos || 0) * Number(entry.pricePerKg || 0))}</div>
                    <div style={styles.muted}>Toimitus: {entry.deliveryMethod || "-"} · {entry.deliveryArea || "-"} · Kulu {entry.deliveryCost !== "" && entry.deliveryCost != null ? `${entry.deliveryCost} €` : "-"} · Aikaisin {entry.earliestDeliveryDate || "-"} · Kylmäkuljetus {entry.coldTransport ? "kyllä" : "ei"}</div>
                  </div>
                  <button style={styles.button} onClick={() => handleDeleteEntry(entry)}>Poista saalistieto</button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {activeTab === "offers" ? (
          <WholesaleOffersView
            profile={profile}
            saleEntries={saleEntries}
            offers={offers}
            buyerOffers={buyerOffers}
            offerForm={offerForm}
            setOfferForm={setOfferForm}
            onCreateOffer={handleCreateOffer}
            onUpdateOfferStatus={onUpdateOfferStatus}
            buyerTypeLabel={buyerTypeLabel}
            buyerStatusLabel={buyerStatusLabel}
            shouldRevealBuyerIdentity={shouldRevealBuyerIdentity}
          />
        ) : null}

        {activeTab === "reports" ? <ReportsView entries={entries} offers={offers} /> : null}

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
              <div style={styles.field}><label>Ryhmä</label><select style={styles.input} value={buyerForm.buyer_type} onChange={(e) => setBuyerForm((prev) => ({ ...prev, buyer_type: e.target.value }))}><option value="ravintola">Ravintola</option><option value="tukku">Tukku</option><option value="kauppa">Kauppa</option></select></div>
              <div style={styles.field}><label>Yhteyshenkilö</label><input style={styles.input} value={buyerForm.contact_name} onChange={(e) => setBuyerForm((prev) => ({ ...prev, contact_name: e.target.value }))} placeholder="Nimi" /></div>
              <div style={styles.field}><label>Sähköposti</label><input style={styles.input} type="email" value={buyerForm.email} onChange={(e) => setBuyerForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="email@yritys.fi" /></div>
              <div style={styles.field}><label>Puhelin</label><input style={styles.input} value={buyerForm.phone} onChange={(e) => setBuyerForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="Puhelin" /></div>
              <div style={styles.field}><label>Paikkakunta</label><input style={styles.input} value={buyerForm.city} onChange={(e) => setBuyerForm((prev) => ({ ...prev, city: e.target.value }))} placeholder="Paikkakunta" /></div>
              <div style={styles.field}><label>Min kg</label><input style={styles.input} type="number" value={buyerForm.min_kg} onChange={(e) => setBuyerForm((prev) => ({ ...prev, min_kg: e.target.value }))} placeholder="Esim. tukkuille" /></div>
              <div style={styles.field}><label>Max kg</label><input style={styles.input} type="number" value={buyerForm.max_kg} onChange={(e) => setBuyerForm((prev) => ({ ...prev, max_kg: e.target.value }))} placeholder="Esim. ravintoloille" /></div>
              <div style={styles.field}><label><input type="checkbox" checked={buyerForm.is_active} onChange={(e) => setBuyerForm((prev) => ({ ...prev, is_active: e.target.checked }))} /> Aktiivinen</label></div>
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
                        <span style={styles.badge}>{buyer.buyer_type}</span>
                        <span style={styles.badge}>{buyer.email}</span>
                        <span style={styles.badge}>{buyer.is_active ? "Aktiivinen" : "Pois käytöstä"}</span>
                        {buyer.min_kg !== "" ? <span style={styles.badge}>Min {buyer.min_kg} kg</span> : null}
                        {buyer.max_kg !== "" ? <span style={styles.badge}>Max {buyer.max_kg} kg</span> : null}
                      </div>
                      <div style={styles.muted}>{buyer.contact_name || "-"}{buyer.phone ? ` · ${buyer.phone}` : ""}{buyer.city ? ` · ${buyer.city}` : ""}</div>
                      {buyer.notes ? <div style={styles.muted}>{buyer.notes}</div> : null}
                    </div>
                    <div style={styles.row}>
                      <button style={styles.button} onClick={() => startEditBuyer(buyer)}>Muokkaa</button>
                      <button style={styles.button} onClick={() => toggleBuyerActive(buyer)}>{buyer.is_active ? "Poista käytöstä" : "Aktivoi"}</button>
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
              <div style={styles.noticeInfo}>Lisää tähän kollegan sähköposti. Sen jälkeen hän voi rekisteröityä itse omalla salasanallaan.</div>
              <div style={styles.field}><label>Nimi</label><input style={styles.input} value={newAllowedForm.displayName} onChange={(e) => setNewAllowedForm((prev) => ({ ...prev, displayName: e.target.value }))} placeholder="Esim. Antti Kalastaja" /></div>
              <div style={styles.field}><label>Sähköposti</label><input style={styles.input} type="email" value={newAllowedForm.email} onChange={(e) => setNewAllowedForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="esim. antti@yritys.fi" /></div>
              <div style={styles.field}><label>Rooli</label><select style={styles.input} value={newAllowedForm.role} onChange={(e) => setNewAllowedForm((prev) => ({ ...prev, role: e.target.value }))}><option value="member">Kalastaja</option><option value="buyer">Ostaja</option><option value="owner">Omistaja</option></select></div>
              {userMessage ? <div style={styles.noticeSuccess}>{userMessage}</div> : null}
              <button style={{ ...styles.button, ...styles.primaryButton }} onClick={handleCreateAllowedUser}>Lisää sallittuihin</button>
            </div>
            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
              <strong>Käyttäjähallinta</strong>
              {allowedUsers.length === 0 ? <div style={styles.muted}>Ei vielä sallittuja käyttäjiä.</div> : allowedUsers.map((user) => (
                <div key={user.id} style={styles.entry}>
                  <div style={styles.entryHeader}>
                    <div>
                      <div style={styles.entryBadges}>
                        <span style={styles.badge}>{user.display_name}</span>
                        <span style={styles.badge}>{user.email}</span>
                        <span style={styles.badge}>{user.role === "owner" ? "Omistaja" : user.role === "buyer" ? "Ostaja" : "Käyttäjä"}</span>
                        <span style={styles.badge}>{user.is_active ? "Aktiivinen" : "Pois käytöstä"}</span>
                      </div>
                    </div>
                    <button style={styles.button} onClick={() => toggleAllowedUserActive(user)}>{user.is_active ? "Poista käytöstä" : "Aktivoi"}</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
