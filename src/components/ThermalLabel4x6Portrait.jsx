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
    display: "grid",
    gridTemplateRows: "21mm 1fr 45mm",
    gap: "3mm",
  },
  brand: {
    display: "grid",
    gridTemplateColumns: "22mm 1fr",
    gap: "3mm",
    alignItems: "center",
    paddingBottom: "2mm",
    borderBottom: `0.5mm solid ${palette.border}`,
    minWidth: 0,
  },
  logoWrap: {
    width: "22mm",
    height: "18mm",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#ffffff",
    overflow: "hidden",
  },
  logo: {
    width: "21mm",
    height: "auto",
    maxWidth: "21mm",
    maxHeight: "18mm",
    objectFit: "contain",
    filter: "none",
    display: "block",
  },
  brandTitle: {
    fontSize: "17pt",
    lineHeight: 0.95,
    fontWeight: 900,
    letterSpacing: "-0.035em",
    wordBreak: "break-word",
  },
  brandSubtitle: {
    marginTop: "1mm",
    fontSize: "8.5pt",
    lineHeight: 1.1,
    color: palette.muted,
    fontWeight: 700,
  },
  main: {
    minHeight: 0,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "1.7mm",
  },
  species: {
    fontSize: "34pt",
    lineHeight: 0.9,
    fontWeight: 900,
    letterSpacing: "-0.045em",
    wordBreak: "break-word",
  },
  scientific: {
    fontSize: "11.5pt",
    lineHeight: 1.05,
    color: palette.muted,
    fontStyle: "italic",
    fontWeight: 600,
    wordBreak: "break-word",
  },
  batchBox: {
    marginTop: "0.5mm",
    padding: "2.2mm 2.8mm",
    border: `0.45mm solid ${palette.accentBorder}`,
    borderRadius: "2.4mm",
    background: palette.accentBg,
  },
  batchLabel: {
    fontSize: "8.5pt",
    lineHeight: 1,
    fontWeight: 900,
    color: palette.muted,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  batchValue: {
    marginTop: "1mm",
    fontSize: "15pt",
    lineHeight: 1,
    fontWeight: 900,
    wordBreak: "break-word",
  },
  infoGrid: {
    display: "grid",
    gap: "1mm",
    minHeight: 0,
  },
  line: {
    fontSize: "10.2pt",
    lineHeight: 1.08,
    wordBreak: "break-word",
  },
  catchDate: {
    fontSize: "11.2pt",
    lineHeight: 1.08,
    fontWeight: 900,
    wordBreak: "break-word",
  },
  weightLine: {
    display: "grid",
    gridTemplateColumns: "auto 1fr auto",
    alignItems: "end",
    gap: "2.2mm",
    marginTop: 0,
    minHeight: "7mm",
    fontSize: "11pt",
    lineHeight: 1,
    fontWeight: 900,
  },
  weightWriteLine: {
    height: "5.2mm",
    borderBottom: `0.55mm solid ${palette.text}`,
  },
  footer: {
    display: "grid",
    gridTemplateRows: "auto 1fr",
    gap: "1.2mm",
    alignItems: "start",
    minHeight: 0,
    paddingTop: "1.2mm",
    borderTop: `0.5mm solid ${palette.border}`,
  },
  footerContent: {
    display: "grid",
    gridTemplateColumns: "34mm 1fr",
    gap: "3.5mm",
    alignItems: "start",
    minHeight: 0,
  },
  qrFrame: {
    width: "34mm",
    height: "34mm",
    padding: "1mm",
    border: `0.45mm solid ${palette.border}`,
    borderRadius: "2.2mm",
    background: "#fff",
    boxSizing: "border-box",
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
    gap: "0.9mm",
  },
  supplierLine: {
    fontSize: "8.9pt",
    lineHeight: 1.1,
    wordBreak: "break-word",
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

export default function ThermalLabel4x6Portrait({ label }) {
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

      <section style={styles.main}>
        <div>
          <div style={styles.species}>{label.species || "-"}</div>
          {label.scientificName ? <div style={styles.scientific}>{label.scientificName}</div> : null}
        </div>

        <div style={styles.batchBox}>
          <div style={styles.batchLabel}>Erätunnus</div>
          <div style={styles.batchValue}>{label.batchId || "-"}</div>
        </div>

        <div style={styles.infoGrid}>
          <InfoLine value={label.productionMethodText} />
          <InfoLine label="Pyyntialue" value={label.catchArea} />
          <InfoLine label="Pyyntimenetelmä" value={label.gearType} />
          <InfoLine label="Pyyntipäivä" value={label.catchDate} emphasis />
          <InfoLine label="Kaupallisen kalastajan tunnus" value={label.commercialFishingId} />
          <InfoLine label="Tuote" value={label.productForm} />
          <InfoLine value={label.productStateText} />
          <InfoLine label="Säilytys" value="0-2 °C" />
        </div>

      </section>

      <section style={styles.footer}>
        <div style={styles.weightLine}>
          <span>{label.isCrayfish ? "Kpl:" : "Paino:"}</span>
          {label.isCrayfish && label.pieceCount ? <strong>{label.pieceCount}</strong> : <span style={styles.weightWriteLine} />}
          <span>{label.isCrayfish ? "kpl" : "kg"}</span>
        </div>
        <div style={styles.footerContent}>
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
