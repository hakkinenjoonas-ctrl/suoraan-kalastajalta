import React from "react";

export const THERMAL_LABEL_4X6_SIZE_MM = {
  width: 102,
  height: 152,
};

const palette = {
  text: "#0f172a",
  muted: "#475569",
  border: "#cbd5e1",
  accentBorder: "#93c5fd",
  accentBg: "#eff6ff",
  bg: "#ffffff",
};

const styles = {
  root: {
    width: "102mm",
    height: "152mm",
    margin: 0,
    padding: "6mm",
    overflow: "hidden",
    boxSizing: "border-box",
    background: palette.bg,
    color: palette.text,
    fontFamily: "Inter, Arial, sans-serif",
    display: "grid",
    gridTemplateRows: "20mm auto 1fr auto",
    gap: "3mm",
  },
  brandRow: {
    display: "grid",
    gridTemplateColumns: "18mm 1fr auto",
    gap: "3mm",
    alignItems: "center",
    minHeight: 0,
  },
  brandLogoWrap: {
    width: "18mm",
    height: "18mm",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  brandLogo: {
    width: "16mm",
    height: "16mm",
    objectFit: "contain",
    display: "block",
  },
  brandTextWrap: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  },
  brandTitle: {
    fontSize: "13pt",
    fontWeight: 900,
    lineHeight: 1,
    letterSpacing: "-0.02em",
  },
  brandSubtitle: {
    marginTop: "1.2mm",
    fontSize: "7pt",
    lineHeight: 1.15,
    color: palette.muted,
  },
  ovalWrap: {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  contentRow: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: "3mm",
    minHeight: 0,
  },
  panel: {
    minWidth: 0,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  },
  species: {
    fontSize: "18pt",
    fontWeight: 900,
    lineHeight: 0.98,
    textTransform: "uppercase",
    letterSpacing: "-0.02em",
    wordBreak: "break-word",
  },
  scientific: {
    marginTop: "1.2mm",
    fontSize: "9pt",
    lineHeight: 1.15,
    color: palette.muted,
    fontStyle: "italic",
    wordBreak: "break-word",
  },
  infoBlock: {
    marginTop: "2mm",
    display: "grid",
    gap: "1.3mm",
  },
  infoLine: {
    fontSize: "8pt",
    lineHeight: 1.15,
    wordBreak: "break-word",
  },
  infoStrong: {
    fontWeight: 800,
  },
  batchBox: {
    marginTop: "1mm",
    padding: "2.4mm 2.8mm",
    border: `0.45mm solid ${palette.accentBorder}`,
    borderRadius: "2.6mm",
    background: palette.accentBg,
  },
  batchLabel: {
    fontSize: "8pt",
    lineHeight: 1.1,
    fontWeight: 700,
    color: palette.muted,
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  batchValue: {
    marginTop: "1mm",
    fontSize: "11pt",
    lineHeight: 1.05,
    fontWeight: 900,
    wordBreak: "break-word",
  },
  middleInfo: {
    marginTop: "2mm",
    display: "grid",
    gap: "1.2mm",
  },
  middleInfoLine: {
    fontSize: "8.3pt",
    lineHeight: 1.16,
    wordBreak: "break-word",
  },
  weightValue: {
    fontWeight: 900,
  },
  qrWrap: {
    display: "grid",
    gridTemplateColumns: "30mm 1fr",
    gap: "3mm",
    minHeight: 0,
    alignItems: "start",
  },
  qrBox: {
    width: "30mm",
    height: "30mm",
    border: `0.45mm solid ${palette.border}`,
    borderRadius: "2mm",
    padding: "1.2mm",
    background: "#fff",
    justifySelf: "start",
  },
  qrImage: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block",
  },
  supplierBox: {
    minWidth: 0,
    minHeight: 0,
    paddingTop: "2mm",
    borderTop: `0.35mm solid ${palette.border}`,
    display: "flex",
    flexDirection: "column",
    gap: "1.2mm",
    justifyContent: "flex-start",
  },
  supplierLine: {
    fontSize: "7.8pt",
    lineHeight: 1.12,
    wordBreak: "break-word",
  },
};

function renderOvalMark(establishmentNumber) {
  if (!establishmentNumber) return null;
  return (
    <svg
      width="28mm"
      height="15mm"
      viewBox="0 0 160 90"
      xmlns="http://www.w3.org/2000/svg"
      aria-label={`Laitostunnus ${establishmentNumber}`}
      style={{ display: "block" }}
    >
      <ellipse cx="80" cy="45" rx="72" ry="36" fill="white" stroke="black" strokeWidth="2" />
      <text x="80" y="28" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="14" fontWeight="700" fill="black">FI</text>
      <text x="80" y="50" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="18" fontWeight="700" fill="black">{establishmentNumber}</text>
      <text x="80" y="72" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="14" fontWeight="700" fill="black">EC</text>
    </svg>
  );
}

function renderInfoLine(label, value, strong = false) {
  if (!value) return null;
  return (
    <div style={styles.infoLine}>
      <span style={strong ? styles.infoStrong : undefined}>{label}</span>
      {label ? " " : ""}
      <span>{value}</span>
    </div>
  );
}

export default function ThermalLabel4x6({ label }) {
  if (!label) return null;

  return (
    <div style={styles.root}>
      <div style={styles.brandRow}>
        <div style={styles.brandLogoWrap}>
          {label.logoUrl ? <img src={label.logoUrl} alt="Suoraan Kalastajalta" style={styles.brandLogo} /> : null}
        </div>
        <div style={styles.brandTextWrap}>
          <div style={styles.brandTitle}>Suoraan Kalastajalta</div>
          <div style={styles.brandSubtitle}>Kotimainen kala suoraan pyytäjältä</div>
        </div>
        {label.eviraFacilityId ? <div style={styles.ovalWrap}>{renderOvalMark(label.eviraFacilityId)}</div> : null}
      </div>

      <div style={styles.contentRow}>
        <div style={styles.panel}>
          <div style={styles.species}>{label.species || "-"}</div>
          {label.scientificName ? <div style={styles.scientific}>{label.scientificName}</div> : null}

          <div style={styles.infoBlock}>
            {renderInfoLine("", label.productionMethodText)}
            {renderInfoLine("", label.catchArea)}
            {renderInfoLine("Pyydys:", label.gearType)}
          </div>
        </div>

        <div style={styles.panel}>
          <div style={styles.batchBox}>
            <div style={styles.batchLabel}>Erätunnus</div>
            <div style={styles.batchValue}>{label.batchId || "-"}</div>
          </div>

          <div style={styles.middleInfo}>
            <div style={styles.middleInfoLine}><strong>Pyyntipäivä:</strong> {label.catchDate || "-"}</div>
            <div style={styles.middleInfoLine}><strong>Pakkauspäivä:</strong> {label.packDate || "-"}</div>
            <div style={styles.middleInfoLine}><strong>Paino:</strong> <span style={styles.weightValue}>{label.weightText || "-"}</span></div>
          </div>
        </div>

        <div style={{ ...styles.panel, marginTop: "auto" }}>
          <div style={styles.qrWrap}>
          <div style={styles.qrBox}>
            {label.qrImageUrl ? <img src={label.qrImageUrl} alt={`QR ${label.batchId || ""}`} style={styles.qrImage} /> : null}
          </div>

          <div style={styles.supplierBox}>
            <div style={styles.supplierLine}><strong>Toimittaja:</strong> {label.supplier || "-"}</div>
            {label.supplierAddress ? <div style={styles.supplierLine}>{label.supplierAddress}</div> : null}
            {label.supplierContact ? <div style={styles.supplierLine}>{label.supplierContact}</div> : null}
            {label.commercialFishingId ? <div style={styles.supplierLine}><strong>Kalastajatunnus:</strong> {label.commercialFishingId}</div> : null}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
