import React from "react";

export const THERMAL_LABEL_4X3_SIZE_MM = {
  width: 101.6,
  height: 76.2,
};

const palette = {
  text: "#0f172a",
  muted: "#475569",
  border: "#cbd5e1",
  accentBorder: "#93c5fd",
  accentBg: "#eff6ff",
  background: "#ffffff",
};

const styles = {
  root: {
    width: "101.6mm",
    height: "76.2mm",
    margin: 0,
    padding: "4mm",
    overflow: "hidden",
    boxSizing: "border-box",
    background: palette.background,
    color: palette.text,
    fontFamily: "\"Avenir Next\", \"Helvetica Neue\", Arial, sans-serif",
    display: "grid",
    gridTemplateRows: "13mm 1fr",
    gap: "2.2mm",
  },
  brand: {
    display: "grid",
    gridTemplateColumns: "17mm 1fr",
    gap: "2.4mm",
    alignItems: "center",
    paddingBottom: "1.5mm",
    borderBottom: `0.45mm solid ${palette.border}`,
    minWidth: 0,
  },
  logoWrap: {
    width: "17mm",
    height: "12mm",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    background: "#ffffff",
  },
  logo: {
    width: "16mm",
    height: "auto",
    maxWidth: "16mm",
    maxHeight: "12mm",
    objectFit: "contain",
    display: "block",
  },
  brandTitle: {
    fontSize: "12.2pt",
    lineHeight: 0.95,
    fontWeight: 900,
    letterSpacing: "-0.03em",
    wordBreak: "break-word",
  },
  brandSubtitle: {
    marginTop: "0.7mm",
    fontSize: "6.6pt",
    lineHeight: 1.05,
    color: palette.muted,
    fontWeight: 700,
  },
  content: {
    display: "grid",
    gridTemplateColumns: "1.1fr 0.95fr 31mm",
    gap: "2.4mm",
    minHeight: 0,
    minWidth: 0,
  },
  block: {
    minWidth: 0,
    minHeight: 0,
  },
  species: {
    fontSize: "22pt",
    lineHeight: 0.9,
    fontWeight: 900,
    letterSpacing: "-0.04em",
    wordBreak: "break-word",
  },
  scientific: {
    marginTop: "0.8mm",
    fontSize: "8.6pt",
    lineHeight: 1.02,
    color: palette.muted,
    fontStyle: "italic",
    fontWeight: 600,
    wordBreak: "break-word",
  },
  infoGrid: {
    marginTop: "1.5mm",
    display: "grid",
    gap: "0.65mm",
  },
  line: {
    fontSize: "7.2pt",
    lineHeight: 1.04,
    wordBreak: "break-word",
  },
  catchDate: {
    fontSize: "7.8pt",
    lineHeight: 1.04,
    fontWeight: 900,
    wordBreak: "break-word",
  },
  batchBox: {
    padding: "1.8mm 2.2mm",
    border: `0.4mm solid ${palette.accentBorder}`,
    borderRadius: "2mm",
    background: palette.accentBg,
  },
  batchLabel: {
    fontSize: "6.9pt",
    lineHeight: 1,
    fontWeight: 900,
    color: palette.muted,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  batchValue: {
    marginTop: "0.8mm",
    fontSize: "10.5pt",
    lineHeight: 0.98,
    fontWeight: 900,
    wordBreak: "break-word",
  },
  metaGrid: {
    marginTop: "1.5mm",
    display: "grid",
    gap: "0.7mm",
  },
  rightColumn: {
    display: "grid",
    gridTemplateRows: "31mm 1fr",
    gap: "1.5mm",
    minHeight: 0,
  },
  qrFrame: {
    width: "31mm",
    height: "31mm",
    padding: "0.8mm",
    border: `0.4mm solid ${palette.border}`,
    borderRadius: "2mm",
    background: "#fff",
    boxSizing: "border-box",
    justifySelf: "end",
  },
  qrImage: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block",
  },
  supplierBlock: {
    minWidth: 0,
    display: "grid",
    alignContent: "start",
    gap: "0.65mm",
    paddingTop: "1.2mm",
    borderTop: `0.35mm solid ${palette.border}`,
  },
  supplierLine: {
    fontSize: "6.6pt",
    lineHeight: 1.04,
    wordBreak: "break-word",
  },
  weightLine: {
    display: "grid",
    gridTemplateColumns: "auto 1fr auto",
    gap: "1.2mm",
    alignItems: "end",
    marginTop: "1mm",
    fontSize: "7.6pt",
    lineHeight: 1,
    fontWeight: 900,
  },
  weightWriteLine: {
    height: "4mm",
    borderBottom: `0.5mm solid ${palette.text}`,
  },
};

function InfoLine({ label, value, emphasis = false }) {
  if (!value) return null;
  return (
    <div style={emphasis ? styles.catchDate : styles.line}>
      {label ? <strong>{label}: </strong> : null}
      <span>{value}</span>
    </div>
  );
}

export default function ThermalLabel4x3({ label }) {
  if (!label) return null;

  return (
    <div style={styles.root}>
      <section style={styles.brand}>
        <div style={styles.logoWrap}>
          {label.logoUrl ? <img src={label.logoUrl} alt="Suoraan Kalastajalta" style={styles.logo} /> : null}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={styles.brandTitle}>Suoraan Kalastajalta</div>
          <div style={styles.brandSubtitle}>Kotimainen kala suoraan pyytäjältä</div>
        </div>
      </section>

      <section style={styles.content}>
        <div style={styles.block}>
          <div style={styles.species}>{label.species || "-"}</div>
          {label.scientificName ? <div style={styles.scientific}>{label.scientificName}</div> : null}

          <div style={styles.infoGrid}>
            <InfoLine value={label.productionMethodText} />
            <InfoLine label="Pyyntialue" value={label.catchArea} />
            <InfoLine label="Pyyntimenetelmä" value={label.gearType} />
            <InfoLine label="Pyyntipäivä" value={label.catchDate} emphasis />
          </div>
        </div>

        <div style={styles.block}>
          <div style={styles.batchBox}>
            <div style={styles.batchLabel}>Erätunnus</div>
            <div style={styles.batchValue}>{label.batchId || "-"}</div>
          </div>

          <div style={styles.metaGrid}>
            <InfoLine label="Kaupallisen kalastajan tunnus" value={label.commercialFishingId} />
            <InfoLine label="Tuote" value={label.productForm} />
            <InfoLine value={label.productStateText} />
            <InfoLine label="Säilytys" value="0-2 °C" />
          </div>

          <div style={styles.weightLine}>
            <span>Paino:</span>
            <span style={styles.weightWriteLine} />
            <span>kg</span>
          </div>
        </div>

        <div style={styles.rightColumn}>
          <div style={styles.qrFrame}>
            {label.qrImageUrl ? <img src={label.qrImageUrl} alt={`QR ${label.batchId || ""}`} style={styles.qrImage} /> : null}
          </div>
          <div style={styles.supplierBlock}>
            <div style={styles.supplierLine}><strong>Toimittaja:</strong> {label.supplier || "-"}</div>
            {label.supplierAddress ? <div style={styles.supplierLine}>{label.supplierAddress}</div> : null}
            {label.supplierContact ? <div style={styles.supplierLine}>{label.supplierContact}</div> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
