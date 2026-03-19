import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://exuqgemipmaqdkficlfn.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_6OpTn3AxVjMnpei8Bpsy7A_Y8kOXaZP";
const DEFAULT_PUBLIC_APP_URL = "https://suoraan-kalastajalta.vercel.app";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

const fishSpecies = [
  "Muikku",
  "Muikku, perattu",
  "Muikku, perattu päätön",
  "Kuha",
  "Kuha, avattu",
  "Kuha filee",
  "Ahven",
  "Ahven, avattu",
  "Ahven filee",
  "Hauki",
  "Hauki, avattu",
  "Hauki filee",
  "Lahna",
  "Särki",
  "Säyne",
  "Siika",
  "Made",
  "Made, nyljetty",
  "Silakka",
  "Muu",
];
const gearTypes = ["Rysä", "Verkko", "Katiska", "Trooli", "Nuotta", "Vapaväline", "Muu"];
const deliveryMethods = ["Nouto", "Myyjä toimittaa", "Kuljetus järjestetään", "Sovitaan erikseen"];
const processedProductTypes = ["Filee", "Graavi", "Kylmäsavu", "Lämminsavu", "Massa", "Pyörykät", "Pihvit", "Muu"];
const processingMethods = ["Fileointi", "Graavaus", "Kylmäsavustus", "Lämminsavustus", "Jauhatus", "Kypsennys", "Muu"];
const COMMISSION_RATE = 0.03;

const defaultAreas = [
  // SAIMAA
  "Saimaa",
  "Suur-Saimaa",
  "Pien-Saimaa",
  "Puruvesi",
  "Haukivesi",
  "Pihlajavesi",
  "Orivesi (Saimaa)",
  "Pyhäselkä",
  "Enonvesi",
  "Lietvesi",
  "Luonteri",
  "Yövesi",

  // ITÄ-SUOMI
  "Kallavesi",
  "Unnukka",
  "Suvasvesi",
  "Onkivesi",
  "Porovesi",
  "Iisvesi",
  "Nilakka",
  "Keitele",
  "Konnevesi",

  // ETELÄ / KESKI
  "Päijänne",
  "Puula",
  "Jääsjärvi",
  "Vesijärvi (Lahti)",

  // LÄNSI
  "Näsijärvi",
  "Pyhäjärvi",
  "Pyhäjärvi (Tampere)",
  "Vanajavesi",
  "Kyrösjärvi",
  "Lappajärvi",

  // POHJOINEN
  "Oulujärvi",
  "Inari",
  "Kemijärvi",
  "Lokka",
  "Porttipahta",

  // MERI
  "Suomenlahti",
  "Saaristomeri",
  "Selkämeri",
  "Perämeri",
  "Ahvenanmeri",

  // FALLBACK
  "Muu järvi",
  "Merialue (muu)"
];

function safeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createSpeciesRow() {
  return { id: safeId(), species: "Muikku", customSpecies: "", kilos: "", count: "" };
}

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

function getSpeciesRowLabel(row) {
  if (row?.species === "Muu") {
    return String(row?.customSpecies || "").trim() || "Muu";
  }
  return row?.species || "";
}

function getOfferSpeciesHeadline(summary) {
  const firstLine = String(summary || "Kalaerä").split("\n")[0] || "Kalaerä";
  return firstLine
    .replace(/:\s*\d+(?:[.,]\d+)?\s*kg(?:\s*\([^)]*\))?$/i, "")
    .trim() || "Kalaerä";
}

function parsePricePerKgFromNotes(notes) {
  const match = String(notes || "").match(/Hinta:\s*([0-9]+(?:[.,][0-9]+)?)\s*€/i);
  if (!match) return "";
  const parsed = Number(String(match[1]).replace(",", "."));
  return Number.isNaN(parsed) ? "" : parsed;
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

function getPublicBatchInfoUrl(batchId) {
  if (!batchId) return "";
  return `${SUPABASE_URL}/functions/v1/public-batch-info?batchId=${encodeURIComponent(batchId)}`;
}

async function invokeEdgeFunctionAuthenticated(functionName, body, accessToken) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      data,
      error: {
        message: data?.error || `HTTP ${response.status}`,
        status: response.status,
        context: data,
      },
    };
  }

  return { data, error: null };
}

function formatBatchArea(area) {
  return String(area || "BATCH")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase() || "BATCH";
}

async function generateBatchId({ area, date, supabaseClient }) {
  const batchArea = formatBatchArea(area);
  const batchDate = String(date || today()).slice(0, 7);
  const prefix = `${batchArea}-${batchDate}`;

  const [{ count: catchCount, error: catchError }, { count: processedCount, error: processedError }] = await Promise.all([
    supabaseClient
      .from("catch_entries")
      .select("id", { count: "exact", head: true })
      .like("batch_id", `${prefix}-%`),
    supabaseClient
      .from("processed_batches")
      .select("id", { count: "exact", head: true })
      .like("batch_id", `${prefix}-%`),
  ]);

  if (catchError) throw catchError;
  if (processedError && processedError.code !== "PGRST116") throw processedError;

  const sequence = String((Number(catchCount || 0) + Number(processedCount || 0) + 1)).padStart(3, "0");
  return `${prefix}-${sequence}`;
}

function euro(value) {
  return new Intl.NumberFormat("fi-FI", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value || 0);
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
  const kilos = Number(offer?.reserved_kilos || offer?.total_kilos || 0);
  const pricePerKg = Number(
    offer?.counter_price_per_kg || offer?.price_per_kg || offer?.offer_price_per_kg || 0
  );
  const tradeValue = kilos * pricePerKg;
  const commissionValue = tradeValue * commissionRate;

  return {
    billingKilos: kilos,
    billingPricePerKg: pricePerKg,
    tradeValue,
    commissionValue,
  };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function exportCsv(filename, rows) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(";"))
    .join("\n");
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
    { name: "Kuha on kalalistassa", pass: fishSpecies.includes("Kuha") },
    { name: "Nuotta on pyydyslistassa", pass: gearTypes.includes("Nuotta") },
    { name: "Muu on vesialuelistassa", pass: defaultAreas.includes("Muu") },
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
  offerBox: {
    border: "1px solid #bfdbfe",
    borderRadius: 18,
    background: "linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)",
    padding: 16,
  },
  successHighlightBox: {
    border: "1px solid #86efac",
    borderRadius: 18,
    background: "linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)",
    padding: 16,
  },
  checkboxRow: { display: "flex", gap: 20, flexWrap: "wrap" },
  checkboxCard: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    borderRadius: 999,
    border: "1px solid #93c5fd",
    background: "#ffffff",
    fontWeight: 500,
  },
  qrBlock: {
    display: "inline-flex",
    flexDirection: "column",
    gap: 8,
    padding: 12,
    borderRadius: 16,
    border: "1px solid #dbeafe",
    background: "#f8fafc",
    alignItems: "center",
    width: "fit-content",
  },
  qrImage: {
    width: 96,
    height: 96,
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    background: "#fff",
  },
};

function buyerStatusBadgeStyle(status, baseStyle) {
  if (status === "accepted") {
    return { ...baseStyle, background: "#dcfce7", borderColor: "#86efac", color: "#166534" };
  }
  if (status === "reserved") {
    return { ...baseStyle, background: "#fef3c7", borderColor: "#fcd34d", color: "#92400e" };
  }
  if (status === "sold") {
    return { ...baseStyle, background: "#fee2e2", borderColor: "#fca5a5", color: "#b91c1c" };
  }
  return baseStyle;
}

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

async function findAllowedUserByEmail(supabase, email) {
  const normalizedEmail = normalizeEmail(email);
  const { data, error } = await supabase
    .from("allowed_users")
    .select("*")
    .ilike("email", normalizedEmail);

  if (error) return { data: null, error };

  const match = (data || []).find((row) => normalizeEmail(row.email) === normalizedEmail) || null;
  return { data: match, error: null };
}

function responsiveGridStyle(base) {
  if (typeof window !== "undefined" && window.innerWidth < 960) {
    return { ...base, gridTemplateColumns: "1fr" };
  }
  return base;
}

function PublicBatchView({ batchId, data, loading, error }) {
  const headerSummary = [data?.species, data?.quantity != null && data?.quantity !== "" ? `${data.quantity} ${data.unit || "kg"}` : ""]
    .filter(Boolean)
    .join(" · ");
  const infoRows = [
    ["Erätunnus", data?.batch_id],
    ["Tila", data?.status],
    ["Laji", data?.species],
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

  const saleRows = [
    ["Myyntitila", data?.sale_info?.status],
    ["Tarjouksia", data?.sale_info?.offer_count],
    ["Viimeisin päivitys", data?.sale_info?.updated_at ? new Date(data.sale_info.updated_at).toLocaleString("fi-FI") : ""],
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");

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
      `}</style>
      <div style={{ ...styles.container, maxWidth: 960 }}>
        <div style={{ ...styles.card, ...styles.headerCard, marginBottom: 16, background: "linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)" }} className="print-card">
          <div style={styles.rowBetween}>
            <div>
              <div style={{ fontSize: 14, color: "#1d4ed8", fontWeight: 700, marginBottom: 6 }}>Erän jäljitettävyys</div>
              <h1 style={{ ...styles.title, marginBottom: 8 }}>Batch information</h1>
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
                <div key={label} style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 12, borderBottom: "1px solid #e2e8f0", paddingBottom: 8 }}>
                  <div style={{ color: "#475569", fontWeight: 600 }}>{label}</div>
                  <div style={{ color: "#0f172a" }}>{String(value)}</div>
                </div>
              ))}
            </div>

            {data?.species_summary || data?.notes ? (
              <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }} className="print-card">
                <strong style={{ fontSize: 20 }}>Sisältö ja lisätiedot</strong>
                {data?.species_summary ? <div style={{ whiteSpace: "pre-wrap", color: "#0f172a" }}>{data.species_summary}</div> : null}
                {data?.notes ? <div style={{ whiteSpace: "pre-wrap", color: "#475569" }}>{data.notes}</div> : null}
              </div>
            ) : null}

            {processingRows.length > 0 ? (
              <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }} className="print-card">
                <strong style={{ fontSize: 20 }}>Jalostustiedot</strong>
                {processingRows.map(([label, value]) => (
                  <div key={label} style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 12, borderBottom: "1px solid #e2e8f0", paddingBottom: 8 }}>
                    <div style={{ color: "#475569", fontWeight: 600 }}>{label}</div>
                    <div style={{ color: "#0f172a" }}>{String(value)}</div>
                  </div>
                ))}
              </div>
            ) : null}

            {saleRows.length > 0 ? (
              <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }} className="print-card">
                <strong style={{ fontSize: 20 }}>Myynti / tarjous</strong>
                {saleRows.map(([label, value]) => (
                  <div key={label} style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 12, borderBottom: "1px solid #e2e8f0", paddingBottom: 8 }}>
                    <div style={{ color: "#475569", fontWeight: 600 }}>{label}</div>
                    <div style={{ color: "#0f172a" }}>{String(value)}</div>
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
  onUpdateBuyerOfferStatus,
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
      if (offer.status !== "reserved" && offer.status !== "accepted") {
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

    const batchMatches = (buyerOffers || []).filter(
      (offer) => offer.batch_id && entry.batchId && offer.batch_id === entry.batchId
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
      reservation,
      entryOffers: offers.filter((offer) => offer.entry_id === entry.id),
      buyerMatches: [...batchMatches, ...entryMatches].sort(
        (a, b) =>
          new Date(b.updated_at || b.created_at || 0).getTime() -
          new Date(a.updated_at || a.created_at || 0).getTime()
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
          groupedBuyerOffers.map(({ entry, reservation, entryOffers, buyerMatches }) => (
            <div key={entry.id} style={styles.entry}>
              <div style={styles.entryHeader}>
                <div>
                  <div style={styles.entryBadges}>
                    <span style={styles.badge}>{entry.species}</span>
                    <span style={styles.badge}>{entry.kilos} kg</span>
                    <span style={styles.badge}>{entry.ownerName}</span>
                    {reservation?.status === "reserved" ? <span style={buyerStatusBadgeStyle("reserved", styles.badge)}>Varattu</span> : null}
                    {reservation?.status === "accepted" ? <span style={buyerStatusBadgeStyle("accepted", styles.badge)}>Myyty</span> : null}
                    {entry.offerToShops ? <span style={styles.badge}>Kauppoihin</span> : null}
                    {entry.offerToRestaurants ? <span style={styles.badge}>Ravintoloihin</span> : null}
                    {entry.offerToWholesalers ? <span style={styles.badge}>Tukkuihin</span> : null}
                  </div>
                  <div style={styles.muted}>{entry.date} · {entry.area}{entry.municipality ? ` · ${entry.municipality}` : ""}{entry.spot ? ` / ${entry.spot}` : ""}</div>
                  {entry.batchId ? <div style={styles.muted}>Erätunnus: {entry.batchId}</div> : null}
                  {entry.batchId ? <div style={styles.qrBlock}><img src={getBatchQrImageUrl(entry.batchId)} alt={`QR ${entry.batchId}`} style={styles.qrImage} /><div style={styles.small}>QR-koodi erälle</div></div> : null}
                  <div style={styles.muted}>Pyydys: {entry.gear || "-"}</div>
                  {reservation ? (
                    <div style={styles.muted}>
                      {reservation.status === "reserved"
                        ? `Erä on varattu. Varannut: ${shouldRevealBuyerIdentity(reservation.status) ? (reservation.buyer_company_name || reservation.buyer_email || "ostaja") : buyerTypeLabel(reservation.buyer_type)}`
                        : `Erä on myyty. Ostaja: ${shouldRevealBuyerIdentity(reservation.status) ? (reservation.buyer_company_name || reservation.buyer_email || "ostaja") : buyerTypeLabel(reservation.buyer_type)}`}
                    </div>
                  ) : null}
                  <div style={styles.muted}>Toimitus: {entry.deliveryMethod || "-"} · {entry.deliveryArea || "-"} · Kulu {entry.deliveryCost !== "" && entry.deliveryCost != null ? `${entry.deliveryCost} €` : "-"} · Aikaisin {entry.earliestDeliveryDate || "-"} · Kylmäkuljetus {entry.coldTransport ? "kyllä" : "ei"}</div>
                  {entry.commercialFishingId ? <div style={styles.muted}>Kaupallisen kalastajan tunnus: {entry.commercialFishingId}</div> : null}
                </div>
              </div>

              <div style={{ ...styles.stack, marginTop: 12 }}>
                <div style={styles.small}>Suorat tarjoukset tälle erälle: {entryOffers.length}</div>
                <div style={styles.small}>Tarjous lähetetty {buyerMatches.length} ostajalle</div>
                {reservation?.status === "reserved" ? <div style={styles.noticeInfo}>Erä on tällä hetkellä varattu. Voit hyväksyä varauksen tai hylätä sen ostajien vastauksista.</div> : null}
                {reservation?.status === "accepted" ? <div style={styles.noticeSuccess}>Erä on merkitty myydyksi hyväksytyn varauksen perusteella.</div> : null}
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
                          <button style={styles.button} onClick={() => onUpdateBuyerOfferStatus(offer, "rejected")}>Hylkää</button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}

                <div style={styles.small}>Vastauksia: {buyerMatches.filter((offer) => ["countered", "reserved", "accepted", "rejected"].includes(offer.status)).length}</div>
                {buyerMatches.filter((offer) => ["countered", "reserved", "accepted", "rejected"].includes(offer.status)).length === 0 ? (
                  <div style={styles.muted}>Ei vielä ostajien vastauksia.</div>
                ) : (
                  buyerMatches.filter((offer) => ["countered", "reserved", "accepted", "rejected"].includes(offer.status)).map((offer) => {
                    const isAccepted = offer.status === "accepted";
                    const revealIdentity = shouldRevealBuyerIdentity(offer.status);
                    const buyerIdentity = revealIdentity ? (offer.buyer_company_name || offer.buyer_email || "Ostaja") : buyerTypeLabel(offer.buyer_type);

                    return (
                      <div
                        key={offer.id}
                        style={{
                          ...styles.entry,
                          background: isAccepted ? "#ecfdf5" : "#f8fafc",
                          borderLeft: `4px solid ${isAccepted ? "#16a34a" : "#0f172a"}`,
                        }}
                      >
                        <div style={{ ...styles.rowBetween, marginBottom: 10 }}>
                          <strong>{formatOfferDate(offer.updated_at || offer.created_at)}</strong>
                          <div style={styles.entryBadges}>
                            <span style={buyerStatusBadgeStyle(offer.status, styles.badge)}>
                              {buyerStatusLabel(offer.status)}
                            </span>
                            <span style={styles.badge}>{buyerIdentity}</span>
                          </div>
                        </div>

                        <div style={{ ...styles.grid2, marginBottom: 10 }}>
                          <div>
                            <div style={styles.muted}><strong>Erä:</strong> {offer.species_summary || "-"}</div>
                            {offer.batch_id ? <div style={styles.muted}><strong>Erätunnus:</strong> {offer.batch_id}</div> : null}
                            {offer.batch_id ? <div style={{ ...styles.qrBlock, marginTop: 8, marginBottom: 8 }}><img src={getBatchQrImageUrl(offer.batch_id)} alt={`QR ${offer.batch_id}`} style={styles.qrImage} /><div style={styles.small}>QR-koodi erälle</div></div> : null}
                            <div style={styles.muted}><strong>Määrä:</strong> {offer.total_kilos} kg</div>
                            <div style={styles.muted}><strong>Alue:</strong> {offer.area || "-"}{entry.municipality ? ` · ${entry.municipality}` : ""}{offer.spot ? ` / ${offer.spot}` : ""}</div>
                          </div>
                          <div>
                            <div style={styles.muted}><strong>Vastatarjous:</strong> {offer.counter_price_per_kg !== "" && offer.counter_price_per_kg != null ? `${euro(offer.counter_price_per_kg)} / kg` : "-"}</div>
                            {offer.status === "accepted" ? <div style={styles.muted}><strong>Kaupan arvo:</strong> {euro(calculateCommissionDetails(offer).tradeValue)}</div> : null}
                            {offer.status === "accepted" ? <div style={styles.muted}><strong>Komissio ({(COMMISSION_RATE * 100).toFixed(1)} %):</strong> {euro(calculateCommissionDetails(offer).commissionValue)}</div> : null}
                            <div style={styles.muted}><strong>Varattu:</strong> {offer.reserved_kilos !== "" && offer.reserved_kilos != null ? `${offer.reserved_kilos} kg` : "-"}</div>
                            <div style={styles.muted}><strong>Pyydys:</strong> {entry.gear || "-"}</div>
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
                            {offer.status !== "accepted" ? <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => onUpdateBuyerOfferStatus(offer, "accepted")}>Hyväksy kauppa</button> : null}
                            {offer.status !== "rejected" ? <button style={styles.button} onClick={() => onUpdateOfferStatus(offer, "rejected")}>Hylkää</button> : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}

                {reservation?.status === "accepted" ? null : (
                  <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack, marginTop: 8 }}>
                    <strong></strong>
                    </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
        <strong>Ostajien viimeisimmät vastaukset</strong>
        <div style={styles.noticeInfo}>Tässä listassa näytetään vain ostajien tekemät vastaukset: vastatarjoukset, varaukset, hyväksytyt ja hylätyt. Pelkkiä lähetettyjä tarjousrivejä ei näytetä tässä, jotta näkymä pysyy selkeänä.</div>
        {!buyerOffers || buyerOffers.filter((offer) => ["countered", "reserved", "accepted", "rejected"].includes(offer.status)).length === 0 ? (
          <div style={styles.muted}>Ei vielä ostajien vastauksia.</div>
        ) : (
          buyerOffers
            .filter((offer) => ["countered", "reserved", "accepted", "rejected"].includes(offer.status))
            .slice(0, 20)
            .map((offer) => {
            const isAccepted = offer.status === "accepted";
            const isReserved = offer.status === "reserved";
            const revealIdentity = shouldRevealBuyerIdentity(offer.status);
            return (
              <div
                key={offer.id}
                style={{
                  ...styles.entry,
                  background: isAccepted ? "#ecfdf5" : isReserved ? "#fffbeb" : "#fff",
                  borderLeft: `4px solid ${isAccepted ? "#16a34a" : isReserved ? "#f59e0b" : "#0f172a"}`,
                }}
              >
                <div style={{ ...styles.rowBetween, marginBottom: 8 }}>
                  <strong>{formatOfferDate(offer.updated_at || offer.created_at)}</strong>
                  <div style={styles.entryBadges}>
                    <span style={buyerStatusBadgeStyle(offer.status, styles.badge)}>{buyerStatusLabel(offer.status)}</span>
                    <span style={styles.badge}>{revealIdentity ? (offer.buyer_company_name || offer.buyer_email || "Ostaja") : buyerTypeLabel(offer.buyer_type)}</span>
                  </div>
                </div>
                <div>
                  <div style={styles.muted}><strong>Erä:</strong> {offer.species_summary || "-"}</div>
                  {offer.batch_id ? <div style={styles.muted}><strong>Erätunnus:</strong> {offer.batch_id}</div> : null}
                  {offer.batch_id ? <div style={{ ...styles.qrBlock, marginTop: 8, marginBottom: 8 }}><img src={getBatchQrImageUrl(offer.batch_id)} alt={`QR ${offer.batch_id}`} style={styles.qrImage} /><div style={styles.small}>QR-koodi erälle</div></div> : null}
                  <div style={styles.muted}><strong>Määrä:</strong> {offer.total_kilos} kg</div>
                  {offer.counter_price_per_kg !== "" && offer.counter_price_per_kg != null ? <div style={styles.muted}><strong>Vastatarjous:</strong> {euro(offer.counter_price_per_kg)} / kg</div> : null}
                  {offer.reserved_kilos !== "" && offer.reserved_kilos != null ? <div style={styles.muted}><strong>Varattu:</strong> {offer.reserved_kilos} kg</div> : null}
                  {offer.buyer_message ? <div style={styles.muted}><strong>Viesti:</strong> {offer.buyer_message}</div> : null}
                  {revealIdentity ? <div style={styles.muted}><strong>Yhteystiedot:</strong> {offer.buyer_contact_name || "-"} · {offer.buyer_email || "-"}{offer.buyer_phone ? ` · ${offer.buyer_phone}` : ""}</div> : null}
                  {offer.status === "accepted" ? <div style={styles.muted}><strong>Laskutus:</strong> tämä kauppa siirtyy ownerin laskutusnäkymään kuukausikohtaisesti.</div> : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function ReportsView({ entries, processedEntries, offers }) {
  const reportRows = entries.map((entry) => [
    entry.date,
    entry.ownerName,
    entry.area,
    entry.municipality || "",
    entry.spot,
    entry.species,
    entry.kilos,
    entry.count,
    entry.gear,
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

  const processedRows = processedEntries.map((entry) => [
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

  const totalKg = entries.reduce((sum, entry) => sum + Number(entry.kilos || 0), 0);
  const totalProcessedKg = processedEntries.reduce((sum, entry) => sum + Number(entry.kilos || 0), 0);
  const saleCount = entries.filter((entry) => entry.offerToShops || entry.offerToRestaurants || entry.offerToWholesalers).length;
  const processedSaleCount = processedEntries.filter((entry) => entry.offerToShops || entry.offerToRestaurants || entry.offerToWholesalers).length;

  return (
    <div style={styles.grid2}>
      <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
        <strong>Excel-raportit</strong>
        <div style={styles.noticeInfo}>Raportit ladataan CSV-muodossa, joka aukeaa suoraan Excelissä.</div>
        <button
          style={{ ...styles.button, ...styles.primaryButton }}
          onClick={() => exportCsv(`saaliit-${today()}.csv`, [["Pyyntipäivämäärä", "Kirjaaja", "Vesialue", "Paikkakunta", "Pyyntipaikka", "Laji", "Kg", "Kpl", "Pyydys", "Toimitustapa", "Toimitusalue", "Toimituskustannus €", "Aikaisin toimitus", "Kylmäkuljetus", "Lisätiedot"], ...reportRows])}
        >
          Lataa saalisraportti Exceliin
        </button>
        <button
          style={styles.button}
          onClick={() => exportCsv(`tarjoukset-${today()}.csv`, [["Pvm", "Yritys", "Yhteyshenkilö", "Sähköposti", "Puhelin", "Tarjous €/kg", "Tila", "Viesti"], ...offerRows])}
        >
          Lataa tarjousraportti Exceliin
        </button>
        <button
          style={styles.button}
          onClick={() => exportCsv(`jaloste-erat-${today()}.csv`, [["Tuotantopäivä", "Kirjaaja", "Vesialue", "Paikkakunta", "Tuotenimi", "Tuotetyyppi", "Käsittely", "Lajiyhteenveto", "Kg", "Pakkauskoko g", "Pakkausten määrä", "Parasta ennen", "Toimitustapa", "Toimitusalue", "Toimituskustannus €", "Aikaisin toimitus", "Kylmäkuljetus", "Lisätiedot"], ...processedRows])}
        >
          Lataa jaloste-erät Exceliin
        </button>
      </div>

      <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
        <strong>Raporttiyhteenveto</strong>
        <div style={styles.entryBadges}>
          <span style={styles.badge}>{totalKg.toFixed(1)} kg raakasaalista</span>
          <span style={styles.badge}>{totalProcessedKg.toFixed(1)} kg jalosteita</span>
          <span style={styles.badge}>{saleCount} saaliserää myynnissä</span>
          <span style={styles.badge}>{processedSaleCount} jaloste-erää myynnissä</span>
          <span style={styles.badge}>{offers.length} tarjousta</span>
        </div>
        <div style={styles.muted}>Raportit sisältävät kaikki tällä hetkellä näkyvät erät ja tarjoukset.</div>
      </div>
    </div>
  );
}

function BillingView({ buyerOffers, buyerStatusLabel, shouldRevealBuyerIdentity, billingFilter, setBillingFilter, onUpdateBillingStatus }) {
  const acceptedOffers = (buyerOffers || []).filter((offer) => {
    if (offer.status !== "accepted") return false;
    if (billingFilter === "all") return true;
    return (offer.billing_status || "unbilled") === billingFilter;
  });

  const grouped = acceptedOffers.reduce((acc, offer) => {
    const dateValue = offer.updated_at || offer.created_at || new Date().toISOString();
    const monthKey = (() => {
      try {
        const d = new Date(dateValue);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      } catch {
        return "Ei kuukautta";
      }
    })();

    const sellerKey = offer.seller_user_id || offer.seller_name || "Tuntematon myyjä";
    const sellerLabel = offer.seller_name || "Tuntematon myyjä";
    const buyerLabel = shouldRevealBuyerIdentity(offer.status)
      ? (offer.buyer_company_name || offer.buyer_email || "Ostaja")
      : "Anonyymi ostaja";
    const kilos = Number(offer.reserved_kilos || offer.total_kilos || 0);
    const pricePerKg = Number(offer.counter_price_per_kg || offer.price_per_kg || 0);
    const tradeValue = kilos * pricePerKg;
    const commissionValue = tradeValue * COMMISSION_RATE;
    const groupKey = `${monthKey}__${sellerKey}`;

    if (!acc[groupKey]) {
      acc[groupKey] = {
        monthKey,
        sellerKey,
        sellerLabel,
        offers: [],
        totalKilos: 0,
        totalTradeValue: 0,
        totalCommissionValue: 0,
      };
    }

    acc[groupKey].offers.push({
      ...offer,
      buyerLabel,
      billingKilos: kilos,
      billingPricePerKg: pricePerKg,
      tradeValue,
      commissionValue,
    });
    acc[groupKey].totalKilos += kilos;
    acc[groupKey].totalTradeValue += tradeValue;
    acc[groupKey].totalCommissionValue += commissionValue;
    return acc;
  }, {});

  const groups = Object.values(grouped).sort((a, b) => {
    if (a.monthKey === b.monthKey) return a.sellerLabel.localeCompare(b.sellerLabel, "fi");
    return b.monthKey.localeCompare(a.monthKey, "fi");
  });

  const exportBillingCsv = (group) => {
    exportCsv(
      `laskutus-${group.monthKey}-${group.sellerLabel.replace(/[^a-z0-9åäö_-]+/gi, "-")}.csv`,
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
    );
  };

  return (
    <div style={styles.stack}>
      <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
        <div style={styles.rowBetween}>
          <strong>Laskutus</strong>
          <select style={styles.input} value={billingFilter} onChange={(e) => setBillingFilter(e.target.value)}>
            <option value="unbilled">Laskuttamattomat</option>
            <option value="invoiced">Laskutetut</option>
            <option value="paid">Maksetut</option>
            <option value="all">Kaikki</option>
          </select>
        </div>
        <div style={styles.noticeInfo}>Tähän kerätään kaikki hyväksytyt kaupat myyjäkohtaisesti ja kuukausittain. Komissio lasketaan oletuksella {(COMMISSION_RATE * 100).toFixed(1)} % kaupan arvosta.</div>
      </div>

      {groups.length === 0 ? (
        <div style={{ ...styles.card, ...styles.sectionCard }}>
          <div style={styles.muted}>Ei vielä hyväksyttyjä kauppoja laskutettavaksi.</div>
        </div>
      ) : (
        groups.map((group) => (
          <div key={`${group.monthKey}-${group.sellerKey}`} style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
            <div style={styles.rowBetween}>
              <div>
                <strong>{group.sellerLabel}</strong>
                <div style={styles.muted}>Kuukausi: {group.monthKey}</div>
              </div>
              <button style={styles.button} onClick={() => exportBillingCsv(group)}>Vie laskutus CSV</button>
            </div>

            <div style={styles.entryBadges}>
              <span style={styles.badge}>{group.totalKilos.toFixed(1)} kg</span>
              <span style={styles.badge}>{euro(group.totalTradeValue)} kaupan arvo</span>
              <span style={styles.badge}>{euro(group.totalCommissionValue)} komissio</span>
              <span style={styles.badge}>{group.offers.length} kauppaa</span>
            </div>

            {group.offers.map((offer) => (
              <div key={offer.id} style={styles.entry}>
                <div style={styles.entryBadges}>
                  <span style={styles.badge}>{offer.buyerLabel}</span>
                  <span style={styles.badge}>{offer.billingKilos} kg</span>
                  <span style={styles.badge}>{euro(offer.billingPricePerKg)} / kg</span>
                  <span style={styles.badge}>{euro(offer.tradeValue)}</span>
                  <span style={{ ...styles.badge, background: "#ecfdf5", borderColor: "#86efac" }}>{euro(offer.commissionValue)} komissio</span>
                </div>
                <div style={{ ...styles.muted, whiteSpace: "pre-wrap" }}><strong>Erä:</strong> {offer.species_summary || "-"}</div>
                <div style={styles.muted}><strong>Päivä:</strong> {offer.updated_at || offer.created_at || "-"}</div>
                <div style={styles.muted}><strong>Laskutustila:</strong> {offer.billing_status === "paid" ? "Maksettu" : offer.billing_status === "invoiced" ? "Laskutettu" : "Laskuttamaton"}</div>
                {offer.buyer_message ? <div style={styles.muted}><strong>Viesti:</strong> {offer.buyer_message}</div> : null}
                <div style={{ ...styles.row, marginTop: 10 }}>
                  {offer.billing_status !== "invoiced" ? <button style={styles.button} onClick={() => onUpdateBillingStatus(offer, "invoiced")}>Merkitse laskutetuksi</button> : null}
                  {offer.billing_status !== "paid" ? <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => onUpdateBillingStatus(offer, "paid")}>Merkitse maksetuksi</button> : null}
                  {offer.billing_status !== "unbilled" ? <button style={styles.button} onClick={() => onUpdateBillingStatus(offer, "unbilled")}>Palauta laskuttamattomaksi</button> : null}
                </div>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

export default function App() {
  const publicBatchId = getRequestedPublicBatchId();
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [entries, setEntries] = useState([]);
  const [processedEntries, setProcessedEntries] = useState([]);
  const [offers, setOffers] = useState([]);
  const [buyerOffers, setBuyerOffers] = useState([]);
  const [buyerOffersFilter, setBuyerOffersFilter] = useState("open");
  const [billingFilter, setBillingFilter] = useState("unbilled");
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
    area: "Saimaa",
    municipality: "",
    spot: "",
    gear: "Rysä",
    price_per_kg: "",
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
  const [processedForm, setProcessedForm] = useState({
    productionDate: today(),
    bestBeforeDate: "",
    area: "Saimaa",
    municipality: "",
    spot: "",
    productName: "",
    productType: "Filee",
    processingMethod: "Fileointi",
    speciesSummary: "",
    kilos: "",
    packageSizeG: "",
    packageCount: "",
    notes: "",
    offerToShops: false,
    offerToRestaurants: false,
    offerToWholesalers: false,
    deliveryMethod: "Nouto",
    deliveryArea: "",
    deliveryCost: "",
    earliestDeliveryDate: today(),
    coldTransport: true,
  });
  const [newAllowedForm, setNewAllowedForm] = useState({ email: "", displayName: "", role: "member", buyer_id: "" });
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
    delivery_address: "",
    delivery_postcode: "",
    delivery_city: "",
    billing_address: "",
    billing_postcode: "",
    billing_city: "",
    billing_email: "",
    business_id: "",
  });
  const [fisherInfoForm, setFisherInfoForm] = useState({ commercialFishingId: "" });
  const [accountPanelOpen, setAccountPanelOpen] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [accountForm, setAccountForm] = useState({
    displayName: "",
    commercialFishingId: "",
    companyName: "",
    contactName: "",
    phone: "",
    city: "",
    deliveryAddress: "",
    deliveryPostcode: "",
    deliveryCity: "",
    billingAddress: "",
    billingPostcode: "",
    billingCity: "",
    billingEmail: "",
    businessId: "",
    notes: "",
  });
  const [passwordForm, setPasswordForm] = useState({ newPassword: "", confirmPassword: "" });
  const [publicBatchData, setPublicBatchData] = useState(null);
  const [publicBatchLoading, setPublicBatchLoading] = useState(Boolean(publicBatchId));
  const [publicBatchError, setPublicBatchError] = useState("");

  const linkedBuyerRecord = useMemo(() => {
    if (!profile || profile.role !== "buyer") return null;
    const normalizedProfileEmail = normalizeEmail(profile.email);
    return buyers.find((buyer) => buyer.id === profile.buyer_id || normalizeEmail(buyer.email) === normalizedProfileEmail) || null;
  }, [buyers, profile]);

  const calculateCommissionDetails = (offer) => {
    const kilos = Number(offer?.reserved_kilos || offer?.total_kilos || 0);
    const pricePerKg = Number(offer?.counter_price_per_kg || offer?.price_per_kg || 0);
    const tradeValue = kilos * pricePerKg;
    const commissionValue = tradeValue * COMMISSION_RATE;
    return { kilos, pricePerKg, tradeValue, commissionValue };
  };

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
    if (status === "accepted") return "Kauppa hyväksytty";
    if (status === "sold") return "MYYTY";
    if (status === "rejected") return "Hylätty";
    if (status === "cancelled") return "Peruttu";
    return status || "-";
  };

  const shouldRevealBuyerIdentity = (status) => status === "accepted";

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
      sellerName: offer.seller_name || matchingEntry?.ownerName || "Myyjä",
      sellerCommercialFishingId: matchingEntry?.commercialFishingId || "",
      sellerArea: matchingEntry?.area || offer.area || "",
      sellerSpot: matchingEntry?.spot || offer.spot || "",
      deliveryMethod: matchingEntry?.deliveryMethod || "",
      deliveryArea: matchingEntry?.deliveryArea || "",
      deliveryCost: matchingEntry?.deliveryCost,
      earliestDeliveryDate: matchingEntry?.earliestDeliveryDate || "",
      coldTransport: matchingEntry?.coldTransport,
    };
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
  const shouldSendOffer = form.offerToShops || form.offerToRestaurants || form.offerToWholesalers;
  const shouldSendProcessedOffer = processedForm.offerToShops || processedForm.offerToRestaurants || processedForm.offerToWholesalers;

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
        const minOk = minKg == null || totalKilos >= minKg;
        const maxOk = maxKg == null || totalKilos <= maxKg;
        return minOk && maxOk;
      })
      .map((buyer) => ({
        buyer_id: buyer.id,
        email: buyer.email,
        channel: buyer.buyer_type,
        company_name: buyer.company_name,
        contact_name: buyer.contact_name,
      }))
      .filter((recipient, index, array) => index === array.findIndex((item) => (item.email || "").trim().toLowerCase() === (recipient.email || "").trim().toLowerCase()));
  };

  const invalidateSession = async (message = "Istunto on vanhentunut. Kirjaudu uudelleen sisään.") => {
    await clearBrokenSession();
    setSession(null);
    setProfile(null);
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
    setEntries([]);
    setProcessedEntries([]);
    setOffers([]);
      setAllowedUsers([]);
      return;
    }

    const ensureProfile = async () => {
      const email = (session.user.email || "").trim().toLowerCase();
      const { data: allowed, error: allowedError } = await findAllowedUserByEmail(supabase, email);
      if (allowedError && allowedError.code !== "PGRST116") {
        if (isMissingRefreshTokenError(allowedError)) {
          await invalidateSession();
          return;
        }
        setAuthError(allowedError.message);
        return;
      }

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
        if (!existingProfile.buyer_id && allowed?.buyer_id) {
          const { data: updatedProfile, error: updateProfileError } = await supabase
            .from("profiles")
            .update({ buyer_id: allowed.buyer_id })
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
        setFisherInfoForm({ commercialFishingId: profileToUse.commercial_fishing_id || "" });
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
          buyer_id: allowed.buyer_id || null,
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
      const normalizedInsertedProfile = {
        ...insertedProfile,
        email: (insertedProfile.email || email || "").trim().toLowerCase(),
      };
      setProfile(normalizedInsertedProfile);
      setFisherInfoForm({ commercialFishingId: insertedProfile.commercial_fishing_id || "" });
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
      const processedBatchesTableExists = async () => {
        const { error } = await supabase.from("processed_batches").select("id", { count: "exact", head: true });
        return !error;
      };
      const buyerOffersTableExists = async () => {
        const { error } = await supabase.from("buyer_offers").select("id", { count: "exact", head: true });
        return !error;
      };

      try {
        const hasOffersTable = await offerTableExists();
        const hasBuyersTable = await buyersTableExists();
        const hasProcessedBatchesTable = await processedBatchesTableExists();
        const hasBuyerOffersTable = await buyerOffersTableExists();

        const normalizedProfileEmail = (profile.email || "").trim().toLowerCase();

        const buyerOffersPromise = hasBuyerOffersTable
          ? profile.role === "buyer"
            ? (() => {
                const query = supabase
                  .from("buyer_offers")
                  .select("*")
                  .in("status", ["sent", "viewed", "countered", "reserved", "accepted", "sold", "rejected", "expired", "cancelled"])
                  .order("created_at", { ascending: false });
                return profile.buyer_id
                  ? query.or(`buyer_id.eq.${profile.buyer_id},buyer_email.eq.${normalizedProfileEmail}`)
                  : query.eq("buyer_email", normalizedProfileEmail);
              })()
            : supabase
                .from("buyer_offers")
                .select("*")
                .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null });

        const [
          { data: entryData, error: entryError },
          processedEntriesResult,
          { data: allowedData, error: allowedError },
          offerResult,
          buyersResult,
          buyerOffersResult,
        ] = await Promise.all([
          finalEntriesQuery,
          hasProcessedBatchesTable
            ? ((profile.role === "owner" && entryScope === "all")
              ? supabase.from("processed_batches").select("*").order("production_date", { ascending: false }).order("created_at", { ascending: false })
              : supabase.from("processed_batches").select("*").eq("owner_user_id", profile.id).order("production_date", { ascending: false }).order("created_at", { ascending: false }))
            : Promise.resolve({ data: [], error: null }),
          profile.role === "owner"
            ? supabase.from("allowed_users").select("*").order("created_at", { ascending: true })
            : Promise.resolve({ data: [], error: null }),
          hasOffersTable
            ? supabase.from("wholesale_offers").select("*").order("created_at", { ascending: false })
            : Promise.resolve({ data: [], error: null }),
          hasBuyersTable
            ? supabase.from("buyers").select("*").order("company_name", { ascending: true })
            : Promise.resolve({ data: [], error: null }),
          buyerOffersPromise,
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
            municipality: entry.municipality || "",
            spot: entry.spot || "",
            species: entry.species,
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
            ownerUserId: entry.owner_user_id,
            offerToShops: Boolean(entry.offer_to_shops),
            offerToRestaurants: Boolean(entry.offer_to_restaurants),
            offerToWholesalers: Boolean(entry.offer_to_wholesalers),
          })));
        }

        if (processedEntriesResult?.error && processedEntriesResult.error.code !== "PGRST116") {
          if (isMissingRefreshTokenError(processedEntriesResult.error)) {
            await invalidateSession();
            return;
          }
          setAuthError(processedEntriesResult.error.message);
        } else {
          setProcessedEntries((processedEntriesResult?.data || []).map((entry) => ({
            id: entry.id,
            batchId: entry.batch_id,
            productionDate: entry.production_date,
            bestBeforeDate: entry.best_before_date || "",
            area: entry.area,
            municipality: entry.municipality || "",
            spot: entry.spot || "",
            productName: entry.product_name || "",
            productType: entry.product_type || "",
            processingMethod: entry.processing_method || "",
            speciesSummary: entry.species_summary || "",
            kilos: Number(entry.kilos || 0),
            packageSizeG: entry.package_size_g == null ? "" : Number(entry.package_size_g),
            packageCount: entry.package_count == null ? "" : Number(entry.package_count),
            notes: entry.notes || "",
            deliveryMethod: entry.delivery_method || "Nouto",
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
          email: (buyer.email || "").toLowerCase(),
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
            const buyer = buyersData.find((item) => item.id === offer.buyer_id || item.email === (offer.buyer_email || "").toLowerCase());
            return {
              ...offer,
              buyer_email: (offer.buyer_email || "").toLowerCase(),
              total_kilos: Number(offer.total_kilos || 0),
              price_per_kg: offer.price_per_kg == null || offer.price_per_kg === "" ? parsePricePerKgFromNotes(offer.notes) : Number(offer.price_per_kg),
              counter_price_per_kg: offer.counter_price_per_kg == null ? "" : Number(offer.counter_price_per_kg),
              reserved_kilos: offer.reserved_kilos == null ? "" : Number(offer.reserved_kilos),
              buyer_type: buyer?.buyer_type || "",
              buyer_company_name: buyer?.company_name || "",
              buyer_contact_name: buyer?.contact_name || "",
              buyer_phone: buyer?.phone || "",
              billing_status: offer.billing_status || "unbilled",
              billing_month: offer.billing_month || "",
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

  useEffect(() => {
    if (!profile) return;
    setAccountForm({
      displayName: profile.display_name || "",
      commercialFishingId: profile.commercial_fishing_id || "",
      companyName: linkedBuyerRecord?.company_name || "",
      contactName: linkedBuyerRecord?.contact_name || "",
      phone: linkedBuyerRecord?.phone || "",
      city: linkedBuyerRecord?.city || "",
      deliveryAddress: linkedBuyerRecord?.delivery_address || "",
      deliveryPostcode: linkedBuyerRecord?.delivery_postcode || "",
      deliveryCity: linkedBuyerRecord?.delivery_city || "",
      billingAddress: linkedBuyerRecord?.billing_address || "",
      billingPostcode: linkedBuyerRecord?.billing_postcode || "",
      billingCity: linkedBuyerRecord?.billing_city || "",
      billingEmail: linkedBuyerRecord?.billing_email || "",
      businessId: linkedBuyerRecord?.business_id || "",
      notes: linkedBuyerRecord?.notes || "",
    });
  }, [profile, linkedBuyerRecord]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (!q) return true;
      return [entry.species, entry.area, entry.municipality, entry.spot, entry.gear, entry.notes, entry.ownerName].join(" ").toLowerCase().includes(q);
    });
  }, [entries, search]);

  const saleEntries = useMemo(() => entries.filter((entry) => entry.offerToShops || entry.offerToRestaurants || entry.offerToWholesalers), [entries]);
  const processedSaleEntries = useMemo(() => processedEntries.filter((entry) => entry.offerToShops || entry.offerToRestaurants || entry.offerToWholesalers), [processedEntries]);

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
      return { ...row, species: value, customSpecies: value === "Muu" ? row.customSpecies : "" };
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
    setAuthError("");
    setAuthInfo("");
    const email = normalizeEmail(authForm.email);
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
    const email = normalizeEmail(authForm.email);
    const password = authForm.password;
    const displayName = authForm.displayName.trim();
    if (!email || !password || !displayName) {
      setAuthError("Täytä sähköposti, salasana ja nimi.");
      return;
    }
    const { data: allowed, error: allowedError } = await findAllowedUserByEmail(supabase, email);
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

  const handleSaveOwnDetails = async () => {
    if (!profile) return;
    setAuthError("");
    setAuthInfo("");

    const displayName = accountForm.displayName.trim();
    if (!displayName) {
      setAuthError("Täytä vähintään nimi.");
      return;
    }

    setAccountSaving(true);
    try {
      const profilePayload = {
        display_name: displayName,
        ...(profile.role !== "buyer"
          ? { commercial_fishing_id: accountForm.commercialFishingId.trim() || null }
          : {}),
      };

      const { data: updatedProfile, error: profileUpdateError } = await supabase
        .from("profiles")
        .update(profilePayload)
        .eq("id", profile.id)
        .select("*")
        .single();
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
          contact_name: accountForm.contactName.trim(),
          phone: accountForm.phone.trim(),
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
        const { error: buyerUpdateError } = await supabase.from("buyers").update(buyerPayload).eq("id", linkedBuyerRecord.id);
        if (buyerUpdateError) {
          if (isMissingRefreshTokenError(buyerUpdateError)) {
            await invalidateSession();
            return;
          }
          throw buyerUpdateError;
        }
      }

      const normalizedUpdatedProfile = {
        ...updatedProfile,
        email: normalizeEmail(updatedProfile.email || profile.email || ""),
      };
      setProfile(normalizedUpdatedProfile);
      setFisherInfoForm({ commercialFishingId: normalizedUpdatedProfile.commercial_fishing_id || "" });
      setRefreshTick((prev) => prev + 1);
      setAuthInfo("Omat tiedot tallennettu.");
    } catch (error) {
      setAuthError(String(error?.message || error));
    } finally {
      setAccountSaving(false);
    }
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
    const { error } = await supabase.from("allowed_users").insert({
      email,
      display_name: displayName,
      role,
      is_active: true,
      buyer_id: role === "buyer" ? newAllowedForm.buyer_id : null,
    });
    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setUserMessage(error.message);
      return;
    }
    setNewAllowedForm({ email: "", displayName: "", role: "member", buyer_id: "" });
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
      delivery_address: "",
      delivery_postcode: "",
      delivery_city: "",
      billing_address: "",
      billing_postcode: "",
      billing_city: "",
      billing_email: "",
      business_id: "",
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
      delivery_address: buyer.delivery_address || "",
      delivery_postcode: buyer.delivery_postcode || "",
      delivery_city: buyer.delivery_city || "",
      billing_address: buyer.billing_address || "",
      billing_postcode: buyer.billing_postcode || "",
      billing_city: buyer.billing_city || "",
      billing_email: buyer.billing_email || "",
      business_id: buyer.business_id || "",
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

  const deleteBuyer = async (buyer) => {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(`Poistetaanko ostaja ${buyer.company_name || buyer.email} kokonaan?`);
      if (!confirmed) return;
    }

    const unlinkOperations = [
      supabase.from("allowed_users").update({ buyer_id: null }).eq("buyer_id", buyer.id),
      supabase.from("profiles").update({ buyer_id: null }).eq("buyer_id", buyer.id),
      supabase.from("buyer_offers").update({ buyer_id: null }).eq("buyer_id", buyer.id),
    ];

    for (const operation of unlinkOperations) {
      const { error } = await operation;
      if (error) {
        if (isMissingRefreshTokenError(error)) {
          await invalidateSession();
          return;
        }
        setUserMessage(`Ostajan poisto epäonnistui: ${error.message}`);
        return;
      }
    }

    const { data: deletedRows, error } = await supabase
      .from("buyers")
      .delete()
      .eq("id", buyer.id)
      .select("id");
    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setUserMessage(`Ostajan poisto epäonnistui: ${error.message}`);
      return;
    }
    if (!deletedRows || deletedRows.length === 0) {
      setUserMessage("Ostajan poisto ei onnistunut. Riviä ei poistettu tietokannasta.");
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

  const deleteAllowedUser = async (row) => {
    if (normalizeEmail(row.email) === normalizeEmail(profile?.email)) {
      setUserMessage("Et voi poistaa omaa käyttäjääsi sallittujen käyttäjien listasta.");
      return;
    }
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(`Poistetaanko käyttäjä ${row.display_name || row.email} kokonaan?`);
      if (!confirmed) return;
    }
    const { error } = await supabase.from("allowed_users").delete().eq("id", row.id);
    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setUserMessage(error.message);
      return;
    }
    setUserMessage(`Käyttäjä ${row.display_name || row.email} poistettu kokonaan.`);
    setRefreshTick((prev) => prev + 1);
  };

  const sendCatchOfferEmail = async ({ formState, rows, profileState, batchId }) => {
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
        return `${getSpeciesRowLabel(row)}: ${kilos} kg${count > 0 ? ` (${count} kpl)` : ""}`;
      })
      .join(String.fromCharCode(10));

    const totalKilos = rows.reduce((sum, row) => sum + Number(row.kilos || 0), 0);
    const offerUrlBase = getPublicAppBaseUrl();
    const logisticsLines = [
      `Hinta: ${formState.price_per_kg !== "" && formState.price_per_kg != null ? `${formState.price_per_kg} € / kg` : "-"}`,
      `Toimitustapa: ${formState.deliveryMethod || "-"}`,
      `Toimitusalue: ${formState.deliveryArea || "-"}`,
      `Toimituskustannus: ${formState.deliveryCost !== "" ? `${formState.deliveryCost} €` : "-"}`,
      `Aikaisin toimitus: ${formState.earliestDeliveryDate || "-"}`,
      `Kylmäkuljetus: ${formState.coldTransport ? "Kyllä" : "Ei"}`,
      `Kaupallisen kalastajan tunnus: ${profileState?.commercial_fishing_id || "-"}`,
      `Paikkakunta: ${formState.municipality || "-"}`,
    ];

    const entry = {
      species: rows.map((row) => getSpeciesRowLabel(row)).join(", "),
      kilos: totalKilos,
      date: formState.date,
      dateLabel: "Pyyntipäivämäärä",
      area: formState.area,
      municipality: formState.municipality || "",
      spot: formState.spot || "",
      gear: formState.gear || "",
      price_per_kg: formState.price_per_kg === "" || formState.price_per_kg == null ? null : Number(formState.price_per_kg),
      ownerName: profileState?.display_name || profileState?.email || "Tuntematon",
      commercialFishingId: profileState?.commercial_fishing_id || "",
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
    if (!accessToken) {
      throw new Error("Istunto puuttuu. Kirjaudu ulos ja takaisin sisään ennen tarjouksen lähetystä.");
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
          price_per_kg: entry.price_per_kg,
          species_summary: summaryLines,
          area: entry.area,
          spot: entry.spot,
          gear: entry.gear,
          notes: entry.notes || null,
          status: "sent",
          billing_status: "unbilled",
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

      try {
        console.log("About to invoke send-catch-offer-email", {
          recipientEmail: recipient.email,
          recipientCompany: recipient.company_name,
          entry,
        });

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
          accessToken
        );

        console.log("Invoke result", { data, error });

        if (data?.results) {
          console.log("Function results", data.results);
        }

        const functionFailure = Array.isArray(data?.results)
          ? data.results.find((result) => result?.ok === false)
          : null;

        if (error || functionFailure || data?.ok === false) {
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
        } else {
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
        }
      } catch (err) {
        console.error("Email sending failed", err);
        failed.push({
          company_name: recipient.company_name,
          contact_name: recipient.contact_name,
          email: recipient.email,
          channel: recipient.channel,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (failed.length > 0 && sent.length === 0) {
      throw new Error(failed.map((item) => `${item.company_name}: ${item.error}`).join(" | "));
    }

    return { skipped: false, sent, failed };
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
        return `${row.species}: ${kilos} kg${count > 0 ? ` (${count} kpl)` : ""}`;
      })
      .join(String.fromCharCode(10));

    const totalKilos = rows.reduce((sum, row) => sum + Number(row.kilos || 0), 0);
    const offerUrlBase = getPublicAppBaseUrl();
    const logisticsLines = [
      `Hinta: ${formState.price_per_kg !== "" && formState.price_per_kg != null ? `${formState.price_per_kg} € / kg` : "-"}`,
      `Toimitustapa: ${formState.deliveryMethod || "-"}`,
      `Toimitusalue: ${formState.deliveryArea || "-"}`,
      `Toimituskustannus: ${formState.deliveryCost !== "" ? `${formState.deliveryCost} €` : "-"}`,
      `Aikaisin toimitus: ${formState.earliestDeliveryDate || "-"}`,
      `Kylmäkuljetus: ${formState.coldTransport ? "Kyllä" : "Ei"}`,
      `Kaupallisen kalastajan tunnus: ${profileState?.commercial_fishing_id || "-"}`,
      `Paikkakunta: ${formState.municipality || "-"}`,
    ];

    const entry = {
      species: rows.map((row) => row.species).join(", "),
      kilos: totalKilos,
      date: formState.date,
      dateLabel: "Pyyntipäivämäärä",
      area: formState.area,
      municipality: formState.municipality || "",
      spot: formState.spot || "",
      gear: formState.gear || "",
      price_per_kg: formState.price_per_kg === "" || formState.price_per_kg == null ? null : Number(formState.price_per_kg),
      ownerName: profileState?.display_name || profileState?.email || "Tuntematon",
      commercialFishingId: profileState?.commercial_fishing_id || "",
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
          notes: entry.notes || null,
          status: "sent",
          billing_status: "unbilled",
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

      const { data, error } = await supabase.functions.invoke("send-catch-offer-email", {
        body: {
          entry,
          recipients: [{
            email: recipient.email,
            company_name: recipient.company_name,
            offer_id: offerId,
            offer_link: offerId ? `${offerUrlBase}?offer=${offerId}` : null,
          }],
        },
      });
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
      throw new Error(failed.map((item) => `${item.company_name}: ${item.error}`).join(" | "));
    }

    return { skipped: false, sent, failed };
  };

  const refreshBuyerOffers = async () => {
    const normalizedProfileEmail = (profile?.email || "").trim().toLowerCase();
    const query = profile?.role === "buyer"
      ? supabase
          .from("buyer_offers")
          .select("*")
          .eq("buyer_email", normalizedProfileEmail)
          .in("status", ["sent", "viewed", "countered", "reserved", "accepted", "rejected", "expired", "cancelled"])
          .order("created_at", { ascending: false })
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

    setBuyerOffers((data || []).map((offer) => {
      const buyer = buyers.find((item) => item.id === offer.buyer_id || item.email === (offer.buyer_email || "").toLowerCase());
      return {
        ...offer,
        buyer_email: (offer.buyer_email || "").toLowerCase(),
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

  const handleUpdateBillingStatus = async (offer, billingStatus) => {
    const patch = {
      billing_status: billingStatus,
      billed_at: billingStatus === "invoiced" ? new Date().toISOString() : null,
      paid_at: billingStatus === "paid" ? new Date().toISOString() : null,
      billing_month: offer.billing_month || (() => {
        try {
          const d = new Date(offer.updated_at || offer.created_at || new Date().toISOString());
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        } catch {
          return "";
        }
      })(),
      commission_rate: COMMISSION_RATE,
      trade_value: calculateCommissionDetails(offer).tradeValue,
      commission_amount: calculateCommissionDetails(offer).commissionValue,
    };

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
        ? "Kauppa merkitty maksetuksi."
        : billingStatus === "invoiced"
        ? "Kauppa merkitty laskutetuksi."
        : "Kauppa palautettu laskuttamattomaksi."
    );
    setRefreshTick((prev) => prev + 1);
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

    const sellerName = profile?.display_name || profile?.email || offer?.seller_name || "Myyja";
    const tradeValue = euro(calculateCommissionDetails(offer).tradeValue);
    const acceptedKilos = Number(offer?.reserved_kilos || offer?.total_kilos || 0);
    const batchId = offer?.batch_id || "";

    await supabase.functions.invoke("send-buyer-accepted-email", {
      body: {
        buyerEmail,
        offerLink: `${getPublicAppBaseUrl()}?offer=${offer.id}`,
        offer: {
          sellerName,
          species_summary: offer?.species_summary,
          total_kilos: offer?.total_kilos,
          accepted_kilos: acceptedKilos,
          area: offer?.area,
          spot: offer?.spot,
          counter_price_per_kg: offer?.counter_price_per_kg,
          reserved_kilos: offer?.reserved_kilos,
          trade_value: tradeValue,
          batch_id: batchId,
          qr_image_url: getBatchQrImageUrl(batchId),
          buyer_delivery_address: offer?.buyer_delivery_address,
          buyer_delivery_postcode: offer?.buyer_delivery_postcode,
          buyer_delivery_city: offer?.buyer_delivery_city,
          buyer_billing_email: offer?.buyer_billing_email,
          status: "accepted",
        },
      },
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

  const onUpdateBuyerOfferStatus = async (offer, status) => {
    let updatePayload = { status };

    if (status === "accepted") {
      const buyerRecord = buyers.find((buyer) => buyer.id === offer.buyer_id || buyer.email === (offer.buyer_email || "").toLowerCase());

      if (buyerRecord) {
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

    const { error } = await supabase
      .from("buyer_offers")
      .update(updatePayload)
      .eq("id", offer.id);

    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setAuthError(error.message);
      return;
    }

    if (status === "accepted") {
      let competingOffersQuery = supabase
        .from("buyer_offers")
        .update({ status: "sold" })
        .neq("id", offer.id)
        .in("status", ["sent", "viewed", "countered", "reserved"]);

      if (offer.batch_id) {
        competingOffersQuery = competingOffersQuery.eq("batch_id", offer.batch_id);
      } else {
        competingOffersQuery = competingOffersQuery
          .eq("seller_user_id", offer.seller_user_id)
          .eq("area", offer.area)
          .eq("spot", offer.spot || "")
          .eq("total_kilos", offer.total_kilos);
      }

      const { error: competingOffersError } = await competingOffersQuery;
      if (competingOffersError) {
        if (isMissingRefreshTokenError(competingOffersError)) {
          await invalidateSession();
          return;
        }
        setAuthError(competingOffersError.message);
        return;
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
      await sendBuyerAcceptedEmail({ ...offer, ...updatePayload, status: "accepted" });
    }

    await refreshBuyerOffers();
    setRefreshTick((prev) => prev + 1);
  };

  const sendProcessedOfferEmail = async ({ formState, profileState, batchId }) => {
    const rows = [{ species: formState.productName || formState.productType || "Jaloste-erä", kilos: formState.kilos, count: formState.packageCount }];
    const recipients = buildOfferRecipients({
      offerToShops: formState.offerToShops,
      offerToRestaurants: formState.offerToRestaurants,
      offerToWholesalers: formState.offerToWholesalers,
    }, rows).map((recipient) => ({
      ...recipient,
      email: (recipient.email || "").trim().toLowerCase(),
    }));

    if (recipients.length === 0) {
      return { skipped: true, sent: [], failed: [] };
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
      "Toimitus:",
      `Toimitustapa: ${formState.deliveryMethod || "-"}`,
      `Toimitusalue: ${formState.deliveryArea || "-"}`,
      `Toimituskustannus: ${formState.deliveryCost !== "" ? `${formState.deliveryCost} €` : "-"}`,
      `Aikaisin toimitus: ${formState.earliestDeliveryDate || "-"}`,
      `Kylmäkuljetus: ${formState.coldTransport ? "Kyllä" : "Ei"}`,
      `Paikkakunta: ${formState.municipality || "-"}`,
      `Käsittelypaikka: ${formState.spot || "-"}`,
    ].join(String.fromCharCode(10)).trim();

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
          total_kilos: Number(formState.kilos || 0),
          species_summary: summaryLines,
          area: formState.area,
          spot: formState.spot,
          gear: `Jaloste / ${formState.processingMethod || formState.productType || "-"}`,
          notes,
          status: "sent",
          billing_status: "unbilled",
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
            deliveryMethod: formState.deliveryMethod || "Nouto",
            deliveryArea: formState.deliveryArea || "",
            deliveryCost: formState.deliveryCost === "" ? null : Number(formState.deliveryCost),
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
          }],
        },
        accessToken
      );
      if (!error) {
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
        console.error("send-catch-offer-email error", recipient.email, error);
        failed.push({
          company_name: recipient.company_name,
          contact_name: recipient.contact_name,
          email: recipient.email,
          channel: recipient.channel,
          error: error?.context?.error || error?.message || "Tarjoussähköpostin lähetys epäonnistui",
        });
      }
    }

    if (failed.length > 0 && sent.length === 0) {
      throw new Error(failed.map((item) => `${item.company_name}: ${item.error}`).join(" | "));
    }

    return { skipped: false, sent, failed };
  };

  const handleSave = async () => {
    if (!profile) return;
    const validRows = speciesRows.filter((row) => Number(row.kilos || 0) > 0);
    if (!validRows.length) return;
    if (validRows.some((row) => row.species === "Muu" && !String(row.customSpecies || "").trim())) {
      setAuthError("Kirjoita kalalajin nimi kaikille riveille, joilla lajiksi on valittu Muu.");
      return;
    }
    if (form.price_per_kg === "" || form.price_per_kg == null || Number.isNaN(Number(form.price_per_kg))) {
      setAuthError("Täytä hinta (€/kg) ennen saaliin tallennusta.");
      return;
    }
    setSaving(true);
    let batchId;
    try {
      batchId = await generateBatchId({ area: form.area, date: form.date, supabaseClient: supabase });
    } catch (error) {
      setSaving(false);
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setAuthError(error.message || "Batch ID:n luonti epäonnistui.");
      return;
    }
    const payload = validRows.map((row) => ({
      offer_to_shops: form.offerToShops,
      offer_to_restaurants: form.offerToRestaurants,
      offer_to_wholesalers: form.offerToWholesalers,
      date: form.date,
      area: form.area,
      municipality: form.municipality,
      spot: form.spot,
      species: getSpeciesRowLabel(row),
      kilos: Number(row.kilos || 0),
      count: Number(row.count || 0),
      gear: form.gear,
      delivery_method: form.deliveryMethod,
      delivery_area: form.deliveryArea,
      delivery_cost: form.deliveryCost === "" ? null : Number(form.deliveryCost),
      earliest_delivery_date: form.earliestDeliveryDate || null,
      cold_transport: form.coldTransport,
      commercial_fishing_id: profile.commercial_fishing_id || null,
      price_per_kg: form.price_per_kg === "" || form.price_per_kg == null ? null : Number(form.price_per_kg),
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
          if (failedLines.length > 0) {
            setAuthError(parts.join(String.fromCharCode(10)));
            setAuthInfo("");
          } else {
            setAuthInfo(parts.join(String.fromCharCode(10)));
          }
        }
      } else {
        setAuthInfo("Saalis tallennettu.");
      }
    } catch (emailError) {
      console.error("Sähköpostin lähetys epäonnistui:", emailError);
      setAuthError(`Saalis tallennettu, mutta tarjoussähköpostin lähetys epäonnistui: ${String(emailError?.message || emailError)}`);
      setAuthInfo("");
    }

    setSaving(false);
    setForm((prev) => ({
      ...prev,
      municipality: "",
      notes: "",
      price_per_kg: "",
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

  const handleSaveProcessed = async () => {
    if (!profile) return;
    if (!processedForm.productName.trim() || Number(processedForm.kilos || 0) <= 0) {
      setAuthError("Täytä jaloste-erälle vähintään tuotenimi ja määrä kiloina.");
      return;
    }

    setSaving(true);
    let batchId;
    try {
      batchId = await generateBatchId({ area: processedForm.area, date: processedForm.productionDate, supabaseClient: supabase });
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
      area: processedForm.area,
      municipality: processedForm.municipality,
      spot: processedForm.spot,
      product_name: processedForm.productName.trim(),
      product_type: processedForm.productType,
      processing_method: processedForm.processingMethod,
      species_summary: processedForm.speciesSummary.trim(),
      kilos: Number(processedForm.kilos || 0),
      package_size_g: processedForm.packageSizeG === "" ? null : Number(processedForm.packageSizeG),
      package_count: processedForm.packageCount === "" ? null : Number(processedForm.packageCount),
      notes: processedForm.notes,
      offer_to_shops: processedForm.offerToShops,
      offer_to_restaurants: processedForm.offerToRestaurants,
      offer_to_wholesalers: processedForm.offerToWholesalers,
      delivery_method: processedForm.deliveryMethod,
      delivery_area: processedForm.deliveryArea,
      delivery_cost: processedForm.deliveryCost === "" ? null : Number(processedForm.deliveryCost),
      earliest_delivery_date: processedForm.earliestDeliveryDate || null,
      cold_transport: processedForm.coldTransport,
      commercial_fishing_id: profile.commercial_fishing_id || null,
      owner_user_id: profile.id,
      owner_name: profile.display_name,
    };

    const { error } = await supabase.from("processed_batches").insert(payload);
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
      const emailResult = await sendProcessedOfferEmail({ formState: processedForm, profileState: profile, batchId });
      if (shouldSendProcessedOffer) {
        if (emailResult.skipped) {
          setAuthInfo("Jaloste-erä tallennettu, mutta yhtään ostajaa ei täyttänyt tarjousehtoja.");
        } else {
          const sentLines = emailResult.sent.map((item) => `✔ ${item.company_name} (${item.email})`);
          const failedLines = emailResult.failed.map((item) => `✖ ${item.company_name} (${item.email}) – ${item.error}`);
          const parts = [`Jaloste-erä tallennettu. Tarjous lähetetty ${emailResult.sent.length} ostajalle.`];
          if (sentLines.length > 0) parts.push("", "Lähetetty:", ...sentLines);
          if (failedLines.length > 0) parts.push("", "Epäonnistui:", ...failedLines);
          if (failedLines.length > 0) {
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
    setProcessedForm({
      productionDate: today(),
      bestBeforeDate: "",
      area: "Saimaa",
      municipality: "",
      spot: "",
      productName: "",
      productType: "Filee",
      processingMethod: "Fileointi",
      speciesSummary: "",
      kilos: "",
      packageSizeG: "",
      packageCount: "",
      notes: "",
      offerToShops: false,
      offerToRestaurants: false,
      offerToWholesalers: false,
      deliveryMethod: "Nouto",
      deliveryArea: "",
      deliveryCost: "",
      earliestDeliveryDate: today(),
      coldTransport: true,
    });
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

  if (publicBatchId) {
    return <PublicBatchView batchId={publicBatchId} data={publicBatchData} loading={publicBatchLoading} error={publicBatchError} />;
  }

  if (loading) {
    return <div style={styles.app}><div style={styles.container}><div style={{ ...styles.card, ...styles.sectionCard }}>Ladataan...</div></div></div>;
  }

  if (!session || !profile) {
    return <AuthView authMode={authMode} setAuthMode={setAuthMode} authForm={authForm} setAuthForm={setAuthForm} onSignIn={handleSignIn} onSignUp={handleSignUp} authError={authError} authInfo={authInfo} />;
  }

  if (profile.role === "buyer") {
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
      return getOfferSpeciesHeadline(offer?.species_summary);
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
        ? ["sent", "viewed", "countered", "reserved", "sold"].includes(offer.status)
        : buyerOffersFilter === "accepted"
        ? ["accepted", "sold"].includes(offer.status)
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
      (offer) => offer.status === "accepted" && formatOfferDay(offer.updated_at || offer.created_at) === todayLabel
    );

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
                <button style={styles.button} onClick={() => setAccountPanelOpen((prev) => !prev)}>{accountPanelOpen ? "Sulje omat tiedot" : "Omat tiedot"}</button>
                <button style={styles.button} onClick={handleLogout}>Kirjaudu ulos</button>
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
              <div style={styles.grid2}>
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
                        <input style={styles.input} value={accountForm.city} onChange={(e) => setAccountForm((prev) => ({ ...prev, city: e.target.value }))} placeholder="Paikkakunta" />
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
                        <input style={styles.input} value={accountForm.deliveryCity} onChange={(e) => setAccountForm((prev) => ({ ...prev, deliveryCity: e.target.value }))} placeholder="Helsinki" />
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
                        <input style={styles.input} value={accountForm.billingCity} onChange={(e) => setAccountForm((prev) => ({ ...prev, billingCity: e.target.value }))} placeholder="Helsinki" />
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
            </div>
          ) : null}

          {authError ? <div style={{ ...styles.noticeError, marginBottom: 16 }}>{authError}</div> : null}
          {authInfo ? <div style={{ ...styles.noticeSuccess, marginBottom: 16 }}>{authInfo}</div> : null}
          {acceptedBuyerOffers.length > 0 ? (
            <div style={{ ...styles.successHighlightBox, ...styles.stack, marginBottom: 16 }}>
              <div style={styles.rowBetween}>
                <div>
                  <strong>Kauppa hyväksytty</strong>
                  <div style={styles.muted}>
                    {acceptedBuyerOffers.length === 1
                      ? "Sinulla on 1 hyväksytty kauppa. Tarkemmat tiedot löytyvät alempaa tarjouslistan vetolaatikosta."
                      : `Sinulla on ${acceptedBuyerOffers.length} hyväksyttyä kauppaa. Tarkemmat tiedot löytyvät alempaa tarjouslistan vetolaatikosta.`}
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

          <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
            <div style={styles.rowBetween}>
              <strong>Minulle tarjotut erät</strong>
              <div style={styles.row}>
                <select style={styles.input} value={buyerOffersFilter} onChange={(e) => setBuyerOffersFilter(e.target.value)}>
                  <option value="open">Avoimet</option>
                  <option value="reserved">Varatut</option>
                  <option value="accepted">Hyväksytyt / myydyt</option>
                  <option value="countered">Vastatarjoukset</option>
                  <option value="rejected">Hylätyt</option>
                  <option value="all">Kaikki</option>
                </select>
                <input
                  style={{ ...styles.input, width: 320 }}
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
                    return (
                      <div key={o.id} style={{ ...styles.entry, borderLeft: "5px solid #0f172a" }}>
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 6 }}>{formatOfferDate(o.updated_at || o.created_at)}</div>
                          <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.15, marginBottom: 8 }}>{buildOfferHeadline(o)}</div>
                          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
                            <div style={{ fontSize: 24, fontWeight: 700, color: "#0f172a" }}>
                              {o.total_kilos} kg
                            </div>
                            {visiblePrice !== "" && visiblePrice != null ? (
                              <div style={{ fontSize: 24, fontWeight: 700, color: "#0f172a" }}>
                                {euro(visiblePrice)} / kg
                              </div>
                            ) : null}
                          </div>
                          {o.batch_id ? <div style={{ ...styles.muted, marginBottom: 8 }}><strong>Erätunnus:</strong> {o.batch_id}</div> : null}
                          {o.batch_id ? <div style={{ ...styles.qrBlock, marginBottom: 8 }}><img src={getBatchQrImageUrl(o.batch_id)} alt={`QR ${o.batch_id}`} style={styles.qrImage} /><div style={styles.small}>QR-koodi erälle</div></div> : null}
                          <div style={styles.entryBadges}>
                            <span style={styles.badge}>{buyerStatusLabel(o.status)}</span>
                            <span style={styles.badge}>{o.area || "-"}</span>
                            {o.status === "reserved" ? <span style={{ ...styles.badge, background: "#fff7ed", borderColor: "#fdba74" }}>Varaus käynnissä</span> : null}
                            {o.status === "sold" ? <span style={{ ...styles.badge, background: "#fee2e2", borderColor: "#fca5a5", color: "#b91c1c" }}>MYYTY</span> : null}
                            {o.seller_name ? <span style={styles.badge}>Myyjä: {o.seller_name}</span> : null}
                          </div>
                        </div>

                        <div style={{ ...styles.grid2, marginBottom: 10 }}>
                          <div>
                            <div style={styles.muted}><strong>Erän tiedot</strong></div>
                            <div style={{ ...styles.muted, whiteSpace: "pre-wrap" }}>{o.species_summary || "-"}</div>
                            {visiblePrice !== "" && visiblePrice != null ? <div style={styles.muted}>Hinta: {euro(visiblePrice)} / kg</div> : null}
                            {o.spot ? <div style={styles.muted}>Paikka: {o.spot}</div> : null}
                          </div>
                          <div>
                            <div style={styles.muted}><strong>Toimitus ja lisätiedot</strong></div>
                            {o.notes ? <div style={{ ...styles.muted, whiteSpace: "pre-wrap" }}>{o.notes}</div> : <div style={styles.muted}>Ei lisätietoja</div>}
                          </div>
                        </div>

                        {o.buyer_message ? <div style={styles.muted}>Sinun viesti: {o.buyer_message}</div> : null}
                        {o.status === "accepted" ? (
                          <div style={{ ...styles.noticeSuccess, marginTop: 10 }}>
                            Kauppa hyväksytty. Myyjä hyväksyi tarjouksesi.
                          </div>
                        ) : null}
                        {o.status === "sold" ? (
                          <div style={{ ...styles.noticeError, marginTop: 10 }}>
                            MYYTY. Tämä erä on myyty toiselle ostajalle, eikä sitä voi enää varata.
                          </div>
                        ) : null}

                        <div style={{ ...styles.row, marginTop: 12 }}>
                          <button style={styles.button} onClick={() => {
                            if (o.status === "sent") {
                              buyerUpdateOffer(o.id, { status: "viewed" });
                            }
                            setBuyerActiveOfferId(isActive ? null : o.id);
                          }}>{isActive ? "Sulje" : o.status === "reserved" ? "Muokkaa varausta" : o.status === "sold" ? "Näytä tiedot" : "Tee vastatarjous / varaa"}</button>
                          {o.status !== "accepted" && o.status !== "sold" ? <button style={styles.button} onClick={() => onRejectBuyerOffer(o)}>Hylkää</button> : null}
                        </div>

                        {isActive ? (
                          <div style={{ ...styles.stack, marginTop: 12 }}>
                            {o.status === "accepted" ? (
                          <div style={styles.noticeSuccess}>Kauppa on hyväksytty. Myyjän yhteystiedot ja lopullinen toimitus voidaan sopia tämän varauksen pohjalta.</div>
                        ) : null}
                        {o.status === "sold" ? (
                          <div style={styles.noticeError}>Erä on myyty toiselle ostajalle. Varaus- ja vastatarjoustoiminnot eivät ole enää käytettävissä.</div>
                        ) : null}
                        {o.status === "sold" ? null : (
                        <>
                        <div style={styles.field}>
                          <label>Vastatarjous €/kg</label>
                              <input style={styles.input} type="number" value={buyerAction.counter_price_per_kg} onChange={(e) => setBuyerAction((p) => ({ ...p, counter_price_per_kg: e.target.value }))} placeholder="Esim. 5.80" />
                            </div>
                            <div style={styles.field}>
                              <label>Varaa kg (tyhjä = koko erä)</label>
                              <input style={styles.input} type="number" value={buyerAction.reserved_kilos} onChange={(e) => setBuyerAction((p) => ({ ...p, reserved_kilos: e.target.value }))} placeholder={`Max ${o.total_kilos}`} />
                            </div>
                            <div style={styles.field}>
                              <label>Viesti myyjälle</label>
                              <textarea style={styles.textarea} value={buyerAction.buyer_message} onChange={(e) => setBuyerAction((p) => ({ ...p, buyer_message: e.target.value }))} placeholder="Toimitus, nouto, aikataulu..." />
                            </div>
                            <div style={styles.row}>
                              <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => onSubmitCounter(o)}>Lähetä vastatarjous</button>
                              <button style={styles.button} onClick={() => onReserve(o)}>{o.status === "reserved" ? "Päivitä varaus" : "Varaa erä"}</button>
                            </div>
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
        </div>
      </div>
    );
  }

  const tabStyle = profile.role === "owner"
    ? { ...styles.tabs, gridTemplateColumns: "repeat(8, minmax(0, 1fr))" }
    : styles.tabs6;
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
              <p style={styles.subtitle}>Kirjautunut: <strong>{profile.display_name}</strong> · rooli: {profile.role === "owner" ? "omistaja" : profile.role === "buyer" ? "ostaja" : profile.role === "processor" ? "kalanjalostaja" : "käyttäjä"}</p>
              {profile.role !== "buyer" ? <p style={{ ...styles.subtitle, marginTop: 4 }}>Kaupallisen kalastajan tunnus: <strong>{profile.commercial_fishing_id || "ei asetettu"}</strong></p> : null}
            </div>
            <div style={styles.toolbar}>
              {profile.role === "owner" ? (
                <select style={styles.input} value={entryScope} onChange={(e) => setEntryScope(e.target.value)}>
                  <option value="own">Näytä vain omat</option>
                  <option value="all">Näytä kaikkien saaliit</option>
                </select>
              ) : null}
              <span style={styles.badge}>{profile.role === "processor" ? `${totals.totalProcessedKg.toFixed(1)} kg jalosteita` : `${totals.totalKg.toFixed(1)} kg yhteensä`}</span>
              <button style={styles.button} onClick={() => setRefreshTick((prev) => prev + 1)}>Päivitä</button>
              <button style={styles.button} onClick={() => setAccountPanelOpen((prev) => !prev)}>{accountPanelOpen ? "Sulje omat tiedot" : "Omat tiedot"}</button>
              <button style={styles.button} onClick={handleLogout}>Kirjaudu ulos</button>
            </div>
          </div>
        </div>

        {accountPanelOpen ? (
          <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack, marginBottom: 16 }}>
            <div style={styles.rowBetween}>
              <div>
                <strong>Omat tiedot</strong>
                <div style={styles.muted}>Päivitä oma nimi, kalastajatunnus ja salasana.</div>
              </div>
              <span style={styles.badge}>{profile.email}</span>
            </div>
            <div style={styles.grid2}>
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
                <div style={styles.field}>
                  <label>Kaupallisen kalastajan tunnus</label>
                  <input style={styles.input} value={accountForm.commercialFishingId} onChange={(e) => setAccountForm((prev) => ({ ...prev, commercialFishingId: e.target.value }))} placeholder="Esim. 123456" />
                </div>
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
          </div>
        ) : null}

        {authError ? <div style={{ ...styles.noticeError, marginBottom: 16 }}>{authError}</div> : null}
        {authInfo ? <div style={{ ...styles.noticeSuccess, marginBottom: 16 }}>{authInfo}</div> : null}

        <div style={tabStyle}>
          <button style={{ ...styles.tab, ...(activeTab === "dashboard" ? styles.activeTab : {}) }} onClick={() => setActiveTab("dashboard")}>Yhteenveto</button>
          <button style={{ ...styles.tab, ...(activeTab === "add" ? styles.activeTab : {}) }} onClick={() => setActiveTab("add")}>{profile.role === "processor" ? "Lisää jaloste-erä" : "Lisää saalis"}</button>
          <button style={{ ...styles.tab, ...(activeTab === "entries" ? styles.activeTab : {}) }} onClick={() => setActiveTab("entries")}>{profile.role === "processor" ? "Jaloste-erät" : "Saaliit"}</button>
          <button style={{ ...styles.tab, ...(activeTab === "offers" ? styles.activeTab : {}) }} onClick={() => setActiveTab("offers")}>Tarjoukset</button>
          <button style={{ ...styles.tab, ...(activeTab === "reports" ? styles.activeTab : {}) }} onClick={() => setActiveTab("reports")}>Raportit</button>
          {profile.role === "owner" ? <button style={{ ...styles.tab, ...(activeTab === "buyers" ? styles.activeTab : {}) }} onClick={() => setActiveTab("buyers")}>Ostajat</button> : null}
          {profile.role === "owner" ? <button style={{ ...styles.tab, ...(activeTab === "users" ? styles.activeTab : {}) }} onClick={() => setActiveTab("users")}>Käyttäjät</button> : null}
          {profile.role === "owner" ? <button style={{ ...styles.tab, ...(activeTab === "billing" ? styles.activeTab : {}) }} onClick={() => setActiveTab("billing")}>Laskutus</button> : null}
        </div>

        {activeTab === "dashboard" ? (
          <div style={styles.stack}>
            {profile.role !== "buyer" ? (
              <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
                <strong>Kalastajan tiedot</strong>
                <div style={styles.field}>
                  <label>Kaupallisen kalastajan tunnus</label>
                  <input
                    style={styles.input}
                    value={fisherInfoForm.commercialFishingId}
                    onChange={(e) => setFisherInfoForm({ commercialFishingId: e.target.value })}
                    placeholder="Esim. 123456"
                  />
                </div>
                <div>
                  <button
                    style={{ ...styles.button, ...styles.primaryButton }}
                    onClick={async () => {
                      const { data, error } = await supabase
                        .from("profiles")
                        .update({ commercial_fishing_id: fisherInfoForm.commercialFishingId.trim() || null })
                        .eq("id", profile.id)
                        .select("*")
                        .single();
                      if (error) {
                        setAuthError(error.message);
                        return;
                      }
                      setProfile(data);
                      setFisherInfoForm({ commercialFishingId: data.commercial_fishing_id || "" });
                      setAuthInfo("Kaupallisen kalastajan tunnus tallennettu.");
                      setRefreshTick((prev) => prev + 1);
                    }}
                  >
                    Tallenna tunnus
                  </button>
                </div>
              </div>
            ) : null}
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
              <div style={formGrid}>
                <div style={styles.field}><label>Tuotantopäivä</label><input style={styles.input} type="date" value={processedForm.productionDate} onChange={(e) => setProcessedForm({ ...processedForm, productionDate: e.target.value })} /></div>
                <div style={styles.field}><label>Parasta ennen</label><input style={styles.input} type="date" value={processedForm.bestBeforeDate} onChange={(e) => setProcessedForm({ ...processedForm, bestBeforeDate: e.target.value })} /></div>
                <div style={styles.field}><label>Vesialue / alkuperä</label><select style={styles.input} value={processedForm.area} onChange={(e) => setProcessedForm({ ...processedForm, area: e.target.value })}>{defaultAreas.map((area) => <option key={area} value={area}>{area}</option>)}</select></div>
                <div style={styles.field}><label>Paikkakunta</label><input style={styles.input} value={processedForm.municipality} onChange={(e) => setProcessedForm({ ...processedForm, municipality: e.target.value })} placeholder="Esim. Lappeenranta" /></div>
                <div style={styles.field}><label>Tuotenimi</label><input style={styles.input} value={processedForm.productName} onChange={(e) => setProcessedForm({ ...processedForm, productName: e.target.value })} placeholder="Esim. Kylmäsavulohi viipale" /></div>
                <div style={styles.field}><label>Tuotetyyppi</label><select style={styles.input} value={processedForm.productType} onChange={(e) => setProcessedForm({ ...processedForm, productType: e.target.value })}>{processedProductTypes.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
                <div style={styles.field}><label>Käsittelytapa</label><select style={styles.input} value={processedForm.processingMethod} onChange={(e) => setProcessedForm({ ...processedForm, processingMethod: e.target.value })}>{processingMethods.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
                <div style={styles.field}><label>Käsittelypaikka</label><input style={styles.input} value={processedForm.spot} onChange={(e) => setProcessedForm({ ...processedForm, spot: e.target.value })} placeholder="Esim. jalostuskontti / Forelli" /></div>
                <div style={{ ...styles.field, ...styles.fieldFull }}><label>Raaka-aine / lajiyhteenveto</label><textarea style={styles.textarea} value={processedForm.speciesSummary} onChange={(e) => setProcessedForm({ ...processedForm, speciesSummary: e.target.value })} placeholder="Esim. lohi fileenä, kuha fileenä, muikkumassa" /></div>
                <div style={styles.field}><label>Määrä kg</label><input style={styles.input} type="number" value={processedForm.kilos} onChange={(e) => setProcessedForm({ ...processedForm, kilos: e.target.value })} placeholder="0" /></div>
                <div style={styles.field}><label>Pakkauskoko g</label><input style={styles.input} type="number" value={processedForm.packageSizeG} onChange={(e) => setProcessedForm({ ...processedForm, packageSizeG: e.target.value })} placeholder="Esim. 500" /></div>
                <div style={styles.field}><label>Pakkausten määrä</label><input style={styles.input} type="number" value={processedForm.packageCount} onChange={(e) => setProcessedForm({ ...processedForm, packageCount: e.target.value })} placeholder="Esim. 40" /></div>
                <div style={styles.field}><label>Toimitustapa</label><select style={styles.input} value={processedForm.deliveryMethod} onChange={(e) => setProcessedForm({ ...processedForm, deliveryMethod: e.target.value })}>{deliveryMethods.map((method) => <option key={method} value={method}>{method}</option>)}</select></div>
                <div style={styles.field}><label>Toimitusalue</label><input style={styles.input} value={processedForm.deliveryArea} onChange={(e) => setProcessedForm({ ...processedForm, deliveryArea: e.target.value })} placeholder="Esim. Etelä-Suomi" /></div>
                <div style={styles.field}><label>Toimituskustannus €</label><input style={styles.input} type="number" value={processedForm.deliveryCost} onChange={(e) => setProcessedForm({ ...processedForm, deliveryCost: e.target.value })} placeholder="Esim. 65" /></div>
                <div style={styles.field}><label>Aikaisin toimitus</label><input style={styles.input} type="date" value={processedForm.earliestDeliveryDate} onChange={(e) => setProcessedForm({ ...processedForm, earliestDeliveryDate: e.target.value })} /></div>
                <div style={styles.field}><label><input type="checkbox" checked={processedForm.coldTransport} onChange={(e) => setProcessedForm({ ...processedForm, coldTransport: e.target.checked })} /> Kylmäkuljetus</label></div>
                <div style={{ ...styles.field, ...styles.fieldFull }}>
                  <label>Tarjoa jaloste-erää myyntiin</label>
                  <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                    <label><input type="checkbox" checked={processedForm.offerToShops} onChange={(e) => setProcessedForm({ ...processedForm, offerToShops: e.target.checked })} /> Kauppoihin</label>
                    <label><input type="checkbox" checked={processedForm.offerToRestaurants} onChange={(e) => setProcessedForm({ ...processedForm, offerToRestaurants: e.target.checked })} /> Ravintoloihin</label>
                    <label><input type="checkbox" checked={processedForm.offerToWholesalers} onChange={(e) => setProcessedForm({ ...processedForm, offerToWholesalers: e.target.checked })} /> Tukkuihin</label>
                  </div>
                </div>
                <div style={{ ...styles.field, ...styles.fieldFull }}><label>Lisätiedot</label><textarea style={styles.textarea} value={processedForm.notes} onChange={(e) => setProcessedForm({ ...processedForm, notes: e.target.value })} placeholder="Esim. allergeenit, säilytys, pakkausmuoto, toimitusrytmi" /></div>
              </div>
              <div style={{ ...styles.row, justifyContent: "flex-end" }}><button style={{ ...styles.button, ...styles.primaryButton }} onClick={handleSaveProcessed} disabled={saving}>{saving ? "Tallennetaan..." : shouldSendProcessedOffer ? "Tallenna jaloste-erä ja lähetä tarjous" : "Tallenna jaloste-erä"}</button></div>
            </div>
          ) : (
            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
              <div style={formGrid}>
                <div style={styles.field}><label>Pyyntipäivämäärä</label><input style={styles.input} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
                <div style={styles.field}><label>Vesialue</label><select style={styles.input} value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}>{defaultAreas.map((area) => <option key={area} value={area}>{area}</option>)}</select></div>
                <div style={styles.field}><label>Paikkakunta</label><input style={styles.input} value={form.municipality} onChange={(e) => setForm({ ...form, municipality: e.target.value })} placeholder="Esim. Lappeenranta" /></div>
                <div style={styles.field}><label>Tarkempi pyyntipaikka</label><input style={styles.input} value={form.spot} onChange={(e) => setForm({ ...form, spot: e.target.value })} placeholder="Esim. Isoselkä" /></div>
                <div style={styles.field}><label>Kirjaaja</label><input style={styles.input} value={profile.display_name} disabled /></div>
                <div style={{ ...styles.field, ...styles.fieldFull, ...styles.speciesBox, ...styles.stack }}>
                  <div style={styles.rowBetween}><div><label>KALAERÄ</label></div><button style={styles.button} type="button" onClick={addSpeciesRow}>Lisää laji</button></div>
                  {speciesRows.map((row, index) => (
                    <div key={row.id} style={speciesRow}>
                      <div style={styles.field}>
                        <label>Laji {index + 1}</label>
                        <select style={styles.input} value={row.species} onChange={(e) => updateSpeciesRow(row.id, "species", e.target.value)}>{fishSpecies.map((species) => <option key={species} value={species}>{species}</option>)}</select>
                        {row.species === "Muu" ? <input style={{ ...styles.input, marginTop: 8 }} placeholder="Kirjoita kalalaji" value={row.customSpecies} onChange={(e) => updateSpeciesRow(row.id, "customSpecies", e.target.value)} /> : null}
                      </div>
                      <div style={styles.field}><label>Kg</label><input style={styles.input} type="number" placeholder="0" value={row.kilos} onChange={(e) => updateSpeciesRow(row.id, "kilos", e.target.value)} /></div>
                      <div style={styles.field}><label>Kpl</label><input style={styles.input} type="number" placeholder="0" value={row.count} onChange={(e) => updateSpeciesRow(row.id, "count", e.target.value)} /></div>
                      <div style={styles.row}><button style={styles.button} type="button" onClick={() => duplicateSpeciesRow(row.id)}>Kopioi</button><button style={styles.button} type="button" onClick={() => removeSpeciesRow(row.id)}>Poista</button></div>
                    </div>
                  ))}
                </div>
                <div style={styles.field}><label>Hinta (€/kg)</label><input style={styles.input} type="number" step="0.01" value={form.price_per_kg || ""} onChange={(e) => setForm((prev) => ({ ...prev, price_per_kg: e.target.value }))} placeholder="Esim. 5.50" /></div>
              <div style={styles.field}><label>Pyydys</label><select style={styles.input} value={form.gear} onChange={(e) => setForm({ ...form, gear: e.target.value })}>{gearTypes.map((gear) => <option key={gear} value={gear}>{gear}</option>)}</select></div>
                <div style={styles.field}><label>Toimitustapa</label><select style={styles.input} value={form.deliveryMethod} onChange={(e) => setForm({ ...form, deliveryMethod: e.target.value })}>{deliveryMethods.map((method) => <option key={method} value={method}>{method}</option>)}</select></div>
                <div style={styles.field}>
                  <label>{form.deliveryMethod === "Nouto" ? "Nouto-osoite" : "Toimitusalue"}</label>
                  <input
                    style={styles.input}
                    placeholder={form.deliveryMethod === "Nouto" ? "Esim. Satamakatu 1, Kuopio" : "Esim. Etelä-Suomi / Helsinki / koko Suomi"}
                    value={form.deliveryArea}
                    onChange={(e) => setForm({ ...form, deliveryArea: e.target.value })}
                  />
                </div>
                <div style={styles.field}><label>Toimituskustannus €</label><input style={styles.input} type="number" placeholder="Esim. 90" value={form.deliveryCost} onChange={(e) => setForm({ ...form, deliveryCost: e.target.value })} /></div>
                <div style={styles.field}><label>Aikaisin toimitus</label><input style={styles.input} type="date" value={form.earliestDeliveryDate} onChange={(e) => setForm({ ...form, earliestDeliveryDate: e.target.value })} /></div>
                <div style={styles.field}><label><input type="checkbox" checked={form.coldTransport} onChange={(e) => setForm({ ...form, coldTransport: e.target.checked })} /> Kylmäkuljetus</label></div>
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
                      <div style={styles.muted}>Käsittely: {entry.processingMethod || "-"} · Raaka-aine: {entry.speciesSummary || "-"}</div>
                      <div style={styles.muted}>Parasta ennen: {entry.bestBeforeDate || "-"}</div>
                      <div style={styles.muted}>Toimitus: {entry.deliveryMethod || "-"} · {entry.deliveryArea || "-"} · Kulu {entry.deliveryCost !== "" && entry.deliveryCost != null ? `${entry.deliveryCost} €` : "-"} · Aikaisin {entry.earliestDeliveryDate || "-"} · Kylmäkuljetus {entry.coldTransport ? "kyllä" : "ei"}</div>
                      {entry.notes ? <div style={styles.muted}>{entry.notes}</div> : null}
                    </div>
                    <button style={styles.button} onClick={() => handleDeleteProcessedEntry(entry)}>Poista jaloste-erä</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
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
                        <span style={styles.badge}>{entry.ownerName}</span>
                      </div>
                      <div style={styles.muted}>{entry.date} · {entry.area}{entry.municipality ? ` · ${entry.municipality}` : ""}{entry.spot ? ` / ${entry.spot}` : ""}</div>
                      {entry.batchId ? <div style={styles.muted}>Erätunnus: {entry.batchId}</div> : null}
                      {entry.batchId ? <div style={{ ...styles.qrBlock, marginTop: 8 }}><img src={getBatchQrImageUrl(entry.batchId)} alt={`QR ${entry.batchId}`} style={styles.qrImage} /><div style={styles.small}>QR-koodi erälle</div></div> : null}
                      <div style={styles.muted}>Toimitus: {entry.deliveryMethod || "-"} · {entry.deliveryArea || "-"} · Kulu {entry.deliveryCost !== "" && entry.deliveryCost != null ? `${entry.deliveryCost} €` : "-"} · Aikaisin {entry.earliestDeliveryDate || "-"} · Kylmäkuljetus {entry.coldTransport ? "kyllä" : "ei"}</div>
                      {entry.commercialFishingId ? <div style={styles.muted}>Kaupallisen kalastajan tunnus: {entry.commercialFishingId}</div> : null}
                    </div>
                    <button style={styles.button} onClick={() => handleDeleteEntry(entry)}>Poista saalistieto</button>
                  </div>
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
            buyerOffers={buyerOffers}
            offerForm={offerForm}
            setOfferForm={setOfferForm}
            onCreateOffer={handleCreateOffer}
            onUpdateOfferStatus={onUpdateOfferStatus}
            onUpdateBuyerOfferStatus={onUpdateBuyerOfferStatus}
            buyerTypeLabel={buyerTypeLabel}
            buyerStatusLabel={buyerStatusLabel}
            shouldRevealBuyerIdentity={shouldRevealBuyerIdentity}
          />
        ) : null}

        {activeTab === "reports" ? <ReportsView entries={entries} processedEntries={processedEntries} offers={offers} /> : null}

        {activeTab === "billing" && profile.role === "owner" ? (
          <BillingView
            buyerOffers={buyerOffers.map((offer) => ({ ...offer, ...calculateCommissionDetails(offer) }))}
            buyerStatusLabel={buyerStatusLabel}
            shouldRevealBuyerIdentity={shouldRevealBuyerIdentity}
            billingFilter={billingFilter}
            setBillingFilter={setBillingFilter}
            onUpdateBillingStatus={handleUpdateBillingStatus}
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
              <div style={styles.field}><label>Ryhmä</label><select style={styles.input} value={buyerForm.buyer_type} onChange={(e) => setBuyerForm((prev) => ({ ...prev, buyer_type: e.target.value }))}><option value="ravintola">Ravintola</option><option value="tukku">Tukku</option><option value="kauppa">Kauppa</option></select></div>
              <div style={styles.field}><label>Yhteyshenkilö</label><input style={styles.input} value={buyerForm.contact_name} onChange={(e) => setBuyerForm((prev) => ({ ...prev, contact_name: e.target.value }))} placeholder="Nimi" /></div>
              <div style={styles.field}><label>Sähköposti</label><input style={styles.input} type="email" value={buyerForm.email} onChange={(e) => setBuyerForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="email@yritys.fi" /></div>
              <div style={styles.field}><label>Puhelin</label><input style={styles.input} value={buyerForm.phone} onChange={(e) => setBuyerForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="Puhelin" /></div>
              <div style={styles.field}><label>Paikkakunta</label><input style={styles.input} value={buyerForm.city} onChange={(e) => setBuyerForm((prev) => ({ ...prev, city: e.target.value }))} placeholder="Paikkakunta" /></div>
              <div style={styles.field}><label>Min kg</label><input style={styles.input} type="number" value={buyerForm.min_kg} onChange={(e) => setBuyerForm((prev) => ({ ...prev, min_kg: e.target.value }))} placeholder="Esim. tukkuille" /></div>
              <div style={styles.field}><label>Max kg</label><input style={styles.input} type="number" value={buyerForm.max_kg} onChange={(e) => setBuyerForm((prev) => ({ ...prev, max_kg: e.target.value }))} placeholder="Esim. ravintoloille" /></div>
              <div style={styles.field}><label><input type="checkbox" checked={buyerForm.is_active} onChange={(e) => setBuyerForm((prev) => ({ ...prev, is_active: e.target.checked }))} /> Aktiivinen</label></div>
              <div style={styles.field}><label>Toimitusosoite</label><input style={styles.input} value={buyerForm.delivery_address} onChange={(e) => setBuyerForm((prev) => ({ ...prev, delivery_address: e.target.value }))} placeholder="Katuosoite" /></div>
              <div style={styles.field}><label>Toimitus postinumero</label><input style={styles.input} value={buyerForm.delivery_postcode} onChange={(e) => setBuyerForm((prev) => ({ ...prev, delivery_postcode: e.target.value }))} placeholder="00100" /></div>
              <div style={styles.field}><label>Toimitus kaupunki</label><input style={styles.input} value={buyerForm.delivery_city} onChange={(e) => setBuyerForm((prev) => ({ ...prev, delivery_city: e.target.value }))} placeholder="Helsinki" /></div>
              <div style={styles.field}><label>Laskutusosoite</label><input style={styles.input} value={buyerForm.billing_address} onChange={(e) => setBuyerForm((prev) => ({ ...prev, billing_address: e.target.value }))} placeholder="Katuosoite" /></div>
              <div style={styles.field}><label>Laskutus postinumero</label><input style={styles.input} value={buyerForm.billing_postcode} onChange={(e) => setBuyerForm((prev) => ({ ...prev, billing_postcode: e.target.value }))} placeholder="00100" /></div>
              <div style={styles.field}><label>Laskutus kaupunki</label><input style={styles.input} value={buyerForm.billing_city} onChange={(e) => setBuyerForm((prev) => ({ ...prev, billing_city: e.target.value }))} placeholder="Helsinki" /></div>
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
                        <span style={styles.badge}>{buyer.buyer_type}</span>
                        <span style={styles.badge}>{buyer.email}</span>
                        <span style={styles.badge}>{buyer.is_active ? "Aktiivinen" : "Pois käytöstä"}</span>
                        {buyer.min_kg !== "" ? <span style={styles.badge}>Min {buyer.min_kg} kg</span> : null}
                        {buyer.max_kg !== "" ? <span style={styles.badge}>Max {buyer.max_kg} kg</span> : null}
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
              <div style={styles.noticeInfo}>Lisää tähän kollegan sähköposti. Sen jälkeen hän voi rekisteröityä itse omalla salasanallaan.</div>
              <div style={styles.field}><label>Nimi</label><input style={styles.input} value={newAllowedForm.displayName} onChange={(e) => setNewAllowedForm((prev) => ({ ...prev, displayName: e.target.value }))} placeholder="Esim. Antti Kalastaja" /></div>
              <div style={styles.field}><label>Sähköposti</label><input style={styles.input} type="email" value={newAllowedForm.email} onChange={(e) => setNewAllowedForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="esim. antti@yritys.fi" /></div>
              <div style={styles.field}><label>Rooli</label><select style={styles.input} value={newAllowedForm.role} onChange={(e) => setNewAllowedForm((prev) => ({ ...prev, role: e.target.value }))}><option value="member">Kalastaja</option><option value="processor">Kalanjalostaja</option><option value="buyer">Ostaja</option><option value="owner">Omistaja</option></select></div>
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
              {allowedUsers.length === 0 ? <div style={styles.muted}>Ei vielä sallittuja käyttäjiä.</div> : (
                (() => {
                  const userSections = [
                    { title: "Ownerit", items: allowedUsers.filter((user) => user.role === "owner") },
                    { title: "Ostajakäyttäjät", items: allowedUsers.filter((user) => user.role === "buyer") },
                    { title: "Käyttäjät", items: allowedUsers.filter((user) => user.role !== "owner" && user.role !== "buyer") },
                  ];

                  return userSections.map((section) => (
                    section.items.length === 0 ? null : (
                      <div key={section.title} style={styles.stack}>
                        <div style={{ ...styles.card, ...styles.sectionCard, padding: "12px 16px", background: "#f8fafc" }}>
                          <strong>{section.title}</strong>
                        </div>
                        {section.items.map((user) => {
                          const linkedBuyer = buyers.find((buyer) => buyer.id === user.buyer_id);
                          return (
                            <div key={user.id} style={styles.entry}>
                              <div style={styles.entryHeader}>
                                <div>
                                  <div style={styles.entryBadges}>
                                    <span style={styles.badge}>{user.display_name}</span>
                                    <span style={styles.badge}>{user.email}</span>
                                    <span style={styles.badge}>{user.role === "owner" ? "Omistaja" : user.role === "buyer" ? "Ostaja" : user.role === "processor" ? "Kalanjalostaja" : "Käyttäjä"}</span>
                                    <span style={styles.badge}>{user.is_active ? "Aktiivinen" : "Pois käytöstä"}</span>
                                    {linkedBuyer ? <span style={styles.badge}>Ostaja: {linkedBuyer.company_name}</span> : null}
                                  </div>
                                </div>
                                <div style={styles.row}>
                                  <button style={styles.button} onClick={() => toggleAllowedUserActive(user)}>{user.is_active ? "Poista käytöstä" : "Aktivoi"}</button>
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
      </div>
    </div>
  );
}
