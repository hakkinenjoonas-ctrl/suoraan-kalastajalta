import React from "react";

export const THERMAL_LABEL_4X6_SIZE_MM = {
  width: 102,
  height: 152,
};

const palette = {
  text: "#0f172a",
  muted: "#475569",
  border: "#cbd5e1",
  strongBorder: "#94a3b8",
  accent: "#0f172a",
  accentSoft: "#eff6ff",
  background: "#ffffff",
};

const styles = {
  root: {
    width: "102mm",
    height: "152mm",
    margin: 0,
    padding: "6mm",
    overflow: "hidden",
    boxSizing: "border-box",
    background: palette.background,
    color: palette.text,
    fontFamily: "\"Avenir Next\", \"Helvetica Neue\", Arial, sans-serif",
    display: "grid",
    gridTemplateRows: "26mm 26mm 22mm 28mm 1fr",
    gap: "2.5mm",
  },
  section: {
    minWidth: 0,
    minHeight: 0,
  },
  brand: {
    display: "grid",
    gridTemplateColumns: "20mm 1fr",
    gap: "3.5mm",
    alignItems: "center",
    paddingBottom: "2mm",
    borderBottom: `0.45mm solid ${palette.border}`,
  },
  logoWrap: {
    width: "20mm",
    height: "20mm",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: "18mm",
    height: "18mm",
    objectFit: "contain",
    display: "block",
  },
  brandText: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  },
  brandTitle: {
    fontSize: "15pt",
    lineHeight: 0.95,
    fontWeight: 900,
    letterSpacing: "-0.03em",
  },
  brandSubtitle: {
    marginTop: "1.2mm",
    fontSize: "7.2pt",
    lineHeight: 1.15,
    color: palette.muted,
    fontWeight: 600,
  },
  speciesSection: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    paddingBottom: "1mm",
    borderBottom: `0.35mm solid ${palette.border}`,
  },
  species: {
    fontSize: "24pt",
    lineHeight: 0.95,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "-0.04em",
    wordBreak: "break-word",
  },
  scientific: {
    marginTop: "1.6mm",
    fontSize: "9pt",
    lineHeight: 1.15,
    color: palette.muted,
    fontStyle: "italic",
    wordBreak: "break-word",
  },
  originSection: {
    display: "grid",
    alignContent: "start",
    gap: "1.2mm",
    paddingTop: "0.8mm",
    paddingBottom: "1.5mm",
    borderBottom: `0.35mm solid ${palette.border}`,
  },
  bodyLine: {
    fontSize: "8.7pt",
    lineHeight: 1.18,
    wordBreak: "break-word",
  },
  batchSection: {
    display: "grid",
    gridTemplateRows: "auto auto",
    gap: "2mm",
  },
  batchBox: {
    padding: "2.6mm 3mm",
    border: `0.5mm solid ${palette.strongBorder}`,
    borderRadius: "2.8mm",
    background: palette.accentSoft,
  },
  batchLabel: {
    fontSize: "7.8pt",
    lineHeight: 1,
    fontWeight: 800,
    color: palette.muted,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  batchValue: {
    marginTop: "1.2mm",
    fontSize: "12pt",
    lineHeight: 1.05,
    fontWeight: 900,
    wordBreak: "break-word",
  },
  metaGrid: {
    display: "grid",
    gap: "1.1mm",
  },
  metaLine: {
    fontSize: "8.4pt",
    lineHeight: 1.15,
    wordBreak: "break-word",
  },
  footer: {
    display: "grid",
    gridTemplateColumns: "33mm 1fr",
    gap: "3mm",
    alignItems: "start",
    paddingTop: "2mm",
    borderTop: `0.45mm solid ${palette.border}`,
  },
  qrFrame: {
    width: "33mm",
    height: "33mm",
    padding: "1.3mm",
    border: `0.45mm solid ${palette.border}`,
    borderRadius: "2.4mm",
    background: "#fff",
    boxSizing: "border-box",
  },
  qrImage: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block",
  },
  supplier: {
    minWidth: 0,
    display: "grid",
    alignContent: "start",
    gap: "1.1mm",
  },
  supplierTitle: {
    fontSize: "8pt",
    lineHeight: 1.1,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: palette.muted,
  },
  supplierLine: {
    fontSize: "7.9pt",
    lineHeight: 1.16,
    wordBreak: "break-word",
  },
};

function renderLine(value, key, prefix = "") {
  if (!value) return null;
  return (
    <div key={key} style={styles.bodyLine}>
      {prefix ? <strong>{prefix} </strong> : null}
      <span>{value}</span>
    </div>
  );
}

export default function ThermalLabel4x6Portrait({ label }) {
  if (!label) return null;

  return (
    <div style={styles.root}>
      <section style={{ ...styles.section, ...styles.brand }}>
        <div style={styles.logoWrap}>
          {label.logoUrl ? <img src={label.logoUrl} alt="Suoraan Kalastajalta" style={styles.logo} /> : null}
        </div>
        <div style={styles.brandText}>
          <div style={styles.brandTitle}>Suoraan Kalastajalta</div>
          <div style={styles.brandSubtitle}>Kotimainen kala suoraan pyytäjältä</div>
        </div>
      </section>

      <section style={{ ...styles.section, ...styles.speciesSection }}>
        <div style={styles.species}>{label.species || "-"}</div>
        {label.scientificName ? <div style={styles.scientific}>{label.scientificName}</div> : null}
      </section>

      <section style={{ ...styles.section, ...styles.originSection }}>
        {renderLine(label.productionMethodText, "production")}
        {renderLine(label.catchArea, "catchArea")}
        {renderLine(label.gearType, "gear", "Pyydys:")}
      </section>

      <section style={{ ...styles.section, ...styles.batchSection }}>
        <div style={styles.batchBox}>
          <div style={styles.batchLabel}>Erätunnus</div>
          <div style={styles.batchValue}>{label.batchId || "-"}</div>
        </div>
        <div style={styles.metaGrid}>
          <div style={styles.metaLine}><strong>Pyyntipäivä:</strong> {label.catchDate || "-"}</div>
          <div style={styles.metaLine}><strong>Pakkauspäivä:</strong> {label.packDate || "-"}</div>
          <div style={styles.metaLine}><strong>Paino:</strong> {label.weightText || "-"}</div>
        </div>
      </section>

      <section style={{ ...styles.section, ...styles.footer }}>
        <div style={styles.qrFrame}>
          {label.qrImageUrl ? <img src={label.qrImageUrl} alt={`QR ${label.batchId || ""}`} style={styles.qrImage} /> : null}
        </div>
        <div style={styles.supplier}>
          <div style={styles.supplierTitle}>Toimittaja</div>
          <div style={styles.supplierLine}><strong>{label.supplier || "-"}</strong></div>
          {label.supplierAddress ? <div style={styles.supplierLine}>{label.supplierAddress}</div> : null}
          {label.supplierContact ? <div style={styles.supplierLine}>{label.supplierContact}</div> : null}
          {label.commercialFishingId ? <div style={styles.supplierLine}><strong>Kalastajatunnus:</strong> {label.commercialFishingId}</div> : null}
        </div>
      </section>
    </div>
  );
}
