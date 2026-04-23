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
    padding: "5mm",
    overflow: "hidden",
    boxSizing: "border-box",
    background: palette.background,
    color: palette.text,
    fontFamily: "\"Avenir Next\", \"Helvetica Neue\", Arial, sans-serif",
    display: "flex",
    flexDirection: "column",
    gap: "2mm",
  },
  section: {
    minWidth: 0,
    minHeight: 0,
  },
  brand: {
    display: "grid",
    gridTemplateColumns: "18mm 1fr",
    gap: "3mm",
    alignItems: "center",
    flex: "0 0 21mm",
    paddingBottom: "1.4mm",
    borderBottom: `0.45mm solid ${palette.border}`,
  },
  logoWrap: {
    width: "18mm",
    height: "18mm",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: "16.5mm",
    height: "16.5mm",
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
    fontSize: "16pt",
    lineHeight: 0.95,
    fontWeight: 900,
    letterSpacing: "-0.03em",
  },
  brandSubtitle: {
    marginTop: "1mm",
    fontSize: "8pt",
    lineHeight: 1.15,
    color: palette.muted,
    fontWeight: 600,
  },
  speciesSection: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    flex: "0 0 24mm",
    paddingBottom: "1.2mm",
    borderBottom: `0.35mm solid ${palette.border}`,
  },
  species: {
    fontSize: "31pt",
    lineHeight: 0.95,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "-0.04em",
    wordBreak: "break-word",
  },
  scientific: {
    marginTop: "1.2mm",
    fontSize: "11pt",
    lineHeight: 1.15,
    color: palette.muted,
    fontStyle: "italic",
    wordBreak: "break-word",
  },
  originSection: {
    display: "grid",
    alignContent: "start",
    flex: "0 0 24mm",
    gap: "0.9mm",
    paddingTop: "0.6mm",
    paddingBottom: "1.2mm",
    borderBottom: `0.35mm solid ${palette.border}`,
  },
  bodyLine: {
    fontSize: "9.6pt",
    lineHeight: 1.12,
    wordBreak: "break-word",
  },
  batchSection: {
    display: "grid",
    gridTemplateRows: "auto auto",
    flex: "0 0 31mm",
    gap: "1.6mm",
  },
  batchBox: {
    padding: "2mm 2.6mm",
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
    marginTop: "1mm",
    fontSize: "14pt",
    lineHeight: 1.05,
    fontWeight: 900,
    wordBreak: "break-word",
  },
  metaGrid: {
    display: "grid",
    gap: "0.8mm",
  },
  metaLine: {
    fontSize: "9.4pt",
    lineHeight: 1.1,
    wordBreak: "break-word",
  },
  footer: {
    display: "grid",
    gridTemplateColumns: "30mm 1fr",
    gap: "3mm",
    alignItems: "start",
    flex: "1 1 auto",
    minHeight: "34mm",
    paddingTop: "1.6mm",
    borderTop: `0.45mm solid ${palette.border}`,
  },
  qrFrame: {
    width: "30mm",
    height: "30mm",
    padding: "1mm",
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
    gap: "0.8mm",
  },
  supplierTitle: {
    fontSize: "9pt",
    lineHeight: 1.1,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: palette.muted,
  },
  supplierLine: {
    fontSize: "8.4pt",
    lineHeight: 1.1,
    wordBreak: "break-word",
  },
  weightLine: {
    display: "grid",
    gridTemplateColumns: "auto 1fr auto",
    alignItems: "end",
    gap: "2mm",
    fontSize: "9.4pt",
    lineHeight: 1.1,
    fontWeight: 800,
  },
  weightWriteLine: {
    height: "4.2mm",
    borderBottom: `0.45mm solid ${palette.text}`,
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
        {renderLine(label.productForm, "productForm", "Tuote:")}
        {renderLine("0-2 °C", "storage", "Säilytys:")}
      </section>

      <section style={{ ...styles.section, ...styles.batchSection }}>
        <div style={styles.batchBox}>
          <div style={styles.batchLabel}>Erätunnus</div>
          <div style={styles.batchValue}>{label.batchId || "-"}</div>
        </div>
        <div style={styles.metaGrid}>
          <div style={styles.metaLine}><strong>Pyyntipäivä:</strong> {label.catchDate || "-"}</div>
          <div style={styles.metaLine}><strong>Pakkauspäivä:</strong> {label.packDate || "-"}</div>
          <div style={styles.weightLine}>
            <span>Paino:</span>
            <span style={styles.weightWriteLine} />
            <span>kg</span>
          </div>
          <div style={styles.metaLine}><strong>Laatikko:</strong> {label.boxLabel || "-"}</div>
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
