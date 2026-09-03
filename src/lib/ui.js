import { finlandMunicipalities } from "./constants";

export const styles = {
  app: {
    minHeight: "100vh",
    width: "100%",
    background: "radial-gradient(circle at top left, rgba(191,219,254,0.55) 0%, rgba(239,246,255,0.96) 26%, rgba(219,234,254,0.82) 54%, rgba(239,246,255,1) 100%)",
    color: "#0f172a",
    fontFamily: '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    padding: 20,
    boxSizing: "border-box",
    overflowX: "hidden",
  },
  container: { maxWidth: 1320, width: "100%", margin: "0 auto", boxSizing: "border-box" },
  card: {
    background: "rgba(255,255,255,0.88)",
    border: "1px solid rgba(148, 184, 255, 0.28)",
    borderRadius: 24,
    boxShadow: "0 22px 50px rgba(30, 64, 175, 0.08)",
    backdropFilter: "blur(10px)",
  },
  headerCard: {
    padding: 24,
    marginBottom: 22,
    background: "linear-gradient(140deg, rgba(239,246,255,0.98) 0%, rgba(219,234,254,0.95) 42%, rgba(186,230,253,0.92) 100%)",
    border: "1px solid rgba(125, 176, 255, 0.38)",
  },
  sectionCard: { padding: 20 },
  reportTypeCard: {
    padding: 20,
    boxSizing: "border-box",
    minWidth: 0,
    overflow: "hidden",
  },
  reportActionButton: {
    maxWidth: "100%",
    minWidth: 0,
    whiteSpace: "normal",
    textAlign: "center",
    lineHeight: 1.3,
    overflowWrap: "anywhere",
  },
  row: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" },
  rowBetween: {
    display: "flex",
    gap: 16,
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
  },
  title: { margin: 0, fontSize: 38, lineHeight: 1.02, letterSpacing: "-0.04em", fontWeight: 800, color: "#0f172a" },
  subtitle: { margin: "8px 0 0", color: "#475569", fontSize: 14, lineHeight: 1.5 },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 13px",
    borderRadius: 999,
    background: "rgba(239,246,255,0.95)",
    color: "#1e3a8a",
    fontSize: 13,
    fontWeight: 600,
    border: "1px solid rgba(147, 197, 253, 0.92)",
  },
  toolbar: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },
  toolbarActions: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },
  tabs: {
    display: "grid",
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
    gap: 8,
    background: "rgba(255,255,255,0.75)",
    border: "1px solid rgba(147, 197, 253, 0.42)",
    padding: 8,
    borderRadius: 22,
    marginBottom: 18,
    boxShadow: "0 16px 36px rgba(37, 99, 235, 0.07)",
  },
  tabs6: {
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
    gap: 8,
    background: "rgba(255,255,255,0.75)",
    border: "1px solid rgba(147, 197, 253, 0.42)",
    padding: 8,
    borderRadius: 22,
    marginBottom: 18,
    boxShadow: "0 16px 36px rgba(37, 99, 235, 0.07)",
  },
  stickyTabsWrap: {
    position: "sticky",
    top: 10,
    zIndex: 40,
    marginBottom: 18,
    paddingTop: 6,
  },
  tab: {
    border: 0,
    background: "transparent",
    padding: "13px 12px",
    borderRadius: 16,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    color: "#1e3a8a",
    fontWeight: 700,
  },
  activeTab: { background: "linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%)", color: "#fff", boxShadow: "0 14px 28px rgba(37, 99, 235, 0.24)" },
  grid3: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 18 },
  grid2: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 18 },
  stack: { display: "flex", flexDirection: "column", gap: 14 },
  metric: { fontSize: 40, fontWeight: 800, margin: "10px 0 0", letterSpacing: "-0.04em", color: "#0f172a" },
  muted: { color: "#475569", fontSize: 14, lineHeight: 1.55 },
  progress: { height: 12, background: "rgba(191,219,254,0.48)", borderRadius: 999, overflow: "hidden" },
  progressFill: { display: "block", height: "100%", background: "linear-gradient(90deg, #2563eb 0%, #0ea5e9 100%)", borderRadius: 999 },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 },
  field: { display: "flex", flexDirection: "column", gap: 8, minWidth: 0 },
  fieldFull: { gridColumn: "1 / -1" },
  input: {
    width: "100%",
    minWidth: 0,
    maxWidth: "100%",
    padding: "13px 15px",
    border: "1px solid rgba(147, 197, 253, 0.75)",
    borderRadius: 16,
    background: "rgba(255,255,255,0.94)",
    font: "inherit",
    boxSizing: "border-box",
    color: "#0f172a",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.65)",
  },
  dateInput: {
    width: "-webkit-fill-available",
    minWidth: 0,
    maxWidth: "100%",
    display: "block",
  },
  textarea: {
    width: "100%",
    padding: "13px 15px",
    border: "1px solid rgba(147, 197, 253, 0.75)",
    borderRadius: 16,
    background: "rgba(255,255,255,0.94)",
    font: "inherit",
    minHeight: 108,
    resize: "vertical",
    boxSizing: "border-box",
    color: "#0f172a",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.65)",
  },
  button: {
    border: "1px solid rgba(147, 197, 253, 0.72)",
    background: "rgba(255,255,255,0.92)",
    color: "#1e3a8a",
    borderRadius: 16,
    padding: "11px 16px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    fontWeight: 700,
    boxShadow: "0 10px 22px rgba(37, 99, 235, 0.08)",
  },
  primaryButton: { background: "linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%)", color: "#fff", borderColor: "#2563eb" },
  speciesBox: {
    border: "1px solid rgba(147, 197, 253, 0.4)",
    borderRadius: 20,
    background: "linear-gradient(140deg, rgba(248,250,252,0.98) 0%, rgba(239,246,255,0.98) 55%, rgba(224,242,254,0.9) 100%)",
    padding: 18,
  },
  speciesRow: {
    display: "grid",
    gridTemplateColumns: "1.4fr 0.8fr 0.8fr auto",
    gap: 12,
    alignItems: "end",
    background: "rgba(255,255,255,0.96)",
    border: "1px solid rgba(191, 219, 254, 0.95)",
    borderRadius: 18,
    padding: 14,
    boxShadow: "0 10px 22px rgba(59, 130, 246, 0.05)",
  },
  entry: {
    border: "1px solid rgba(191, 219, 254, 0.82)",
    borderRadius: 20,
    padding: 16,
    background: "rgba(255,255,255,0.92)",
    boxShadow: "0 16px 34px rgba(37, 99, 235, 0.06)",
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
    padding: "13px 15px",
    borderRadius: 16,
    fontSize: 14,
    background: "linear-gradient(135deg, #fef2f2 0%, #fff7f7 100%)",
    color: "#b91c1c",
    border: "1px solid #fecaca",
  },
  noticeInfo: {
    padding: "13px 15px",
    borderRadius: 16,
    fontSize: 14,
    background: "linear-gradient(135deg, #eff6ff 0%, #f8fbff 100%)",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe",
    whiteSpace: "pre-wrap",
  },
  noticeSuccess: {
    padding: "13px 15px",
    borderRadius: 16,
    fontSize: 14,
    background: "linear-gradient(135deg, #ecfeff 0%, #f0f9ff 100%)",
    color: "#0f766e",
    border: "1px solid #a5f3fc",
    whiteSpace: "pre-wrap",
  },
  noticeWarning: {
    padding: "13px 15px",
    borderRadius: 16,
    fontSize: 14,
    background: "linear-gradient(135deg, #fffbeb 0%, #fff7ed 100%)",
    color: "#b45309",
    border: "1px solid #fcd34d",
    whiteSpace: "pre-wrap",
  },
  toastStack: {
    position: "fixed",
    top: 18,
    right: 18,
    zIndex: 3000,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    width: "min(420px, calc(100vw - 24px))",
    pointerEvents: "none",
  },
  toastCard: {
    boxShadow: "0 18px 42px rgba(15, 23, 42, 0.18)",
    backdropFilter: "blur(10px)",
    pointerEvents: "auto",
    position: "relative",
    paddingRight: 44,
  },
  toastClose: {
    position: "absolute",
    top: 8,
    right: 8,
    border: 0,
    background: "transparent",
    color: "inherit",
    cursor: "pointer",
    fontSize: 18,
    lineHeight: 1,
    padding: 4,
  },
  onboardingCard: {
    background: "linear-gradient(140deg, rgba(239,246,255,0.98) 0%, rgba(240,249,255,0.98) 45%, rgba(224,242,254,0.96) 100%)",
    border: "1px solid rgba(125, 211, 252, 0.85)",
    boxShadow: "0 18px 40px rgba(14, 165, 233, 0.1)",
  },
  onboardingEyebrow: {
    color: "#0369a1",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: 6,
  },
  onboardingTitle: {
    fontSize: 22,
    color: "#0f172a",
    lineHeight: 1.15,
    letterSpacing: "-0.04em",
  },
  onboardingSteps: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
  },
  onboardingStep: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    background: "rgba(255,255,255,0.9)",
    border: "1px solid rgba(191, 219, 254, 0.95)",
  },
  onboardingStepNumber: {
    width: 30,
    height: 30,
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    fontSize: 13,
    fontWeight: 800,
    color: "#fff",
    background: "linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%)",
  },
  onboardingStepText: {
    color: "#0f172a",
    fontSize: 14,
    lineHeight: 1.55,
  },
  small: { fontSize: 12, color: "#64748b", lineHeight: 1.45 },
  offerBox: {
    border: "1px solid #bfdbfe",
    borderRadius: 20,
    background: "linear-gradient(140deg, #eff6ff 0%, #f0f9ff 58%, #e0f2fe 100%)",
    padding: 18,
  },
  disabledSection: {
    opacity: 0.58,
    pointerEvents: "none",
    filter: "grayscale(0.08)",
  },
  successHighlightBox: {
    border: "1px solid #93c5fd",
    borderRadius: 20,
    background: "linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%)",
    padding: 18,
  },
  checkboxRow: { display: "flex", gap: 20, flexWrap: "wrap" },
  checkboxCard: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "11px 15px",
    borderRadius: 999,
    border: "1px solid rgba(147, 197, 253, 0.85)",
    background: "rgba(255,255,255,0.95)",
    fontWeight: 600,
    color: "#1e3a8a",
  },
  transportPlannerCard: {
    border: "1px solid rgba(125, 211, 252, 0.85)",
    borderRadius: 22,
    background: "linear-gradient(145deg, rgba(239,246,255,0.96) 0%, rgba(240,249,255,0.98) 48%, rgba(224,242,254,0.94) 100%)",
    padding: 18,
    boxShadow: "0 18px 40px rgba(14, 165, 233, 0.09)",
  },
  transportPlannerSteps: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
  },
  transportPlannerStep: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 18,
    border: "1px solid rgba(191, 219, 254, 0.95)",
    background: "rgba(255,255,255,0.92)",
  },
  transportPlannerStepMarker: {
    width: 28,
    height: 28,
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    fontSize: 12,
    fontWeight: 800,
    color: "#fff",
    background: "linear-gradient(135deg, #94a3b8 0%, #cbd5e1 100%)",
  },
  transportPlannerStepMarkerActive: {
    background: "linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%)",
  },
  transportPlannerStepMarkerDone: {
    background: "linear-gradient(135deg, #0891b2 0%, #22c55e 100%)",
  },
  transportSummaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
  },
  transportSummaryCard: {
    padding: 14,
    borderRadius: 18,
    border: "1px solid rgba(147, 197, 253, 0.85)",
    background: "rgba(255,255,255,0.9)",
  },
  qrBlock: {
    display: "inline-flex",
    flexDirection: "column",
    gap: 8,
    padding: 12,
    borderRadius: 18,
    border: "1px solid #bfdbfe",
    background: "linear-gradient(135deg, #f8fbff 0%, #eef6ff 100%)",
    alignItems: "center",
    width: "fit-content",
  },
  qrImage: {
    width: 96,
    height: 96,
    borderRadius: 12,
    border: "1px solid rgba(147, 197, 253, 0.75)",
    background: "#fff",
  },
};

export function buyerStatusBadgeStyle(status, baseStyle) {
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

export const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
export const ANONYMOUS_SELLER_LABEL = "Anonyymi kalastaja";

export function normalizeDestinationCities(value) {
  const list = Array.isArray(value)
    ? value
    : String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  const municipalityByNormalizedName = new Map(
    finlandMunicipalities.map((municipality) => [
      String(municipality || "").trim().toLocaleLowerCase("fi-FI"),
      municipality,
    ]),
  );
  municipalityByNormalizedName.set("kimitoön", "Kemiönsaari");
  return Array.from(new Set(
    list
      .map((item) => String(item || "").trim())
      .map((item) => municipalityByNormalizedName.get(item.toLocaleLowerCase("fi-FI")) || "")
      .filter(Boolean),
  ));
}

export function formatDeliveryDestinations(value) {
  const cities = normalizeDestinationCities(value);
  return cities.length > 0 ? cities.join(", ") : "";
}

export function resolveBuyerDestinationCity(buyer) {
  return String(buyer?.delivery_city || buyer?.city || "").trim();
}

export function getPublicPickupLocation({ municipality, deliveryArea, area }) {
  const municipalityValue = String(municipality || "").trim();
  if (municipalityValue) return municipalityValue;

  const deliveryAreaValue = String(deliveryArea || "").trim();
  if (deliveryAreaValue) {
    const parts = deliveryAreaValue.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length > 1) return parts[parts.length - 1];
    return deliveryAreaValue;
  }

  return String(area || "").trim() || "-";
}

export function roleLabel(role) {
  if (role === "owner") return "Omistaja";
  if (role === "buyer") return "Ostaja";
  if (role === "consumer") return "Kuluttaja";
  if (role === "processor") return "Jalostaja";
  return "Kalastaja";
}

export function buildRoleOptionLabel(option, buyers = []) {
  if (option.role === "buyer") {
    const linkedBuyer = buyers.find((buyer) => buyer.id === option.buyer_id);
    return linkedBuyer?.company_name ? `Ostaja · ${linkedBuyer.company_name}` : "Ostaja";
  }
  return roleLabel(option.role);
}

export function responsiveGridStyle(base, viewportWidth) {
  const width = typeof viewportWidth === "number"
    ? viewportWidth
    : typeof window !== "undefined"
    ? window.innerWidth
    : 0;
  if (width < 960) {
    return { ...base, gridTemplateColumns: "1fr" };
  }
  return base;
}
