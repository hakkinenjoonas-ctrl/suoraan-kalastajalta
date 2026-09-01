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
    gridTemplateRows: "23mm 1fr 45mm",
    gap: "3mm",
  },
  brand: {
    display: "grid",
    gridTemplateColumns: "auto 22mm 1fr",
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
    transform: "scale(1.25)",
    transformOrigin: "center",
  },
  ovalWrap: {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    minWidth: 0,
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
    whiteSpace: "nowrap",
    letterSpacing: "-0.025em",
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

function renderOvalMark(establishmentNumber) {
  if (!establishmentNumber) return null;
  return (
    <svg
      width="35mm"
      height="18.75mm"
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

function InfoLine({ label, value, emphasis = false, stylesOverride = null }) {
  if (!value) return null;
  return (
    <div style={emphasis ? (stylesOverride?.catchDate || styles.catchDate) : (stylesOverride?.line || styles.line)}>
      {label ? <strong>{label}: </strong> : null}
      <span>{value}</span>
    </div>
  );
}

export default function ThermalLabel4x6Portrait({ label }) {
  if (!label) return null;
  const compactCrayfishStyles = label.isCrayfish ? {
    main: { ...styles.main, gap: "1.1mm" },
    species: { ...styles.species, fontSize: "29pt", lineHeight: 0.88 },
    scientific: { ...styles.scientific, fontSize: "10.5pt" },
    batchBox: { ...styles.batchBox, marginTop: 0, padding: "1.6mm 2.2mm" },
    batchValue: { ...styles.batchValue, marginTop: "0.6mm", fontSize: "13.5pt", lineHeight: 0.95 },
    infoGrid: { ...styles.infoGrid, gap: "0.55mm" },
    line: { ...styles.line, fontSize: "9.3pt", lineHeight: 1.03 },
    catchDate: { ...styles.catchDate, fontSize: "10.3pt", lineHeight: 1.03 },
  } : null;
  const batchLength = String(label.batchId || "-").length;
  const defaultBatchFontSize = compactCrayfishStyles ? 13.5 : 15;
  const batchFontSize = `${Math.min(defaultBatchFontSize, (defaultBatchFontSize * 30) / Math.max(batchLength, 1)).toFixed(2)}pt`;

  return (
    <div style={styles.root} data-label-root="true">
      <section style={{
        ...styles.brand,
        gridTemplateColumns: label.eviraFacilityId ? "35mm 22mm 1fr" : "22mm 1fr",
      }}>
        {label.eviraFacilityId ? <div style={styles.ovalWrap}>{renderOvalMark(label.eviraFacilityId)}</div> : null}
        <div style={styles.logoWrap}>
          {label.logoUrl ? <img src={label.logoUrl} alt="Suoraan Kalastajalta" style={styles.logo} /> : null}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={styles.brandTitle}>Suoraan Kalastajalta</div>
          <div style={styles.brandSubtitle}>Kotimainen kala suoraan pyytäjältä</div>
        </div>
      </section>

      <section style={compactCrayfishStyles?.main || styles.main}>
        <div>
          <div style={compactCrayfishStyles?.species || styles.species}>{label.species || "-"}</div>
          {label.scientificName ? <div style={compactCrayfishStyles?.scientific || styles.scientific}>{label.scientificName}</div> : null}
        </div>

        <div style={compactCrayfishStyles?.batchBox || styles.batchBox}>
          <div style={styles.batchLabel}>Erätunnus</div>
          <div data-label-single-line="true" style={{ ...(compactCrayfishStyles?.batchValue || styles.batchValue), fontSize: batchFontSize, overflow: "hidden" }}>{label.batchId || "-"}</div>
        </div>

        <div style={compactCrayfishStyles?.infoGrid || styles.infoGrid}>
          <InfoLine value={label.isCrayfish ? label.harvestSourceText : label.productionMethodText} stylesOverride={compactCrayfishStyles} />
          <InfoLine label="Pyyntialue" value={label.catchArea} stylesOverride={compactCrayfishStyles} />
          <InfoLine label="Pyyntimenetelmä" value={label.gearType} stylesOverride={compactCrayfishStyles} />
          <InfoLine label="Pyyntipäivä" value={label.catchDate} emphasis stylesOverride={compactCrayfishStyles} />
          <InfoLine label="Viimeinen käyttöpäivä" value={label.useByDate} emphasis stylesOverride={compactCrayfishStyles} />
          <InfoLine label="Kaupallisen kalastajan tunnus" value={label.commercialFishingId} stylesOverride={compactCrayfishStyles} />
          <InfoLine value={label.productStateText} stylesOverride={compactCrayfishStyles} />
          <InfoLine label="Säilytys" value={label.storageText} stylesOverride={compactCrayfishStyles} />
        </div>

      </section>

      <section style={styles.footer}>
        <div style={styles.weightLine}>
          <span>{label.isCrayfish ? "Kpl:" : "Paino:"}</span>
          {(label.isCrayfish ? label.pieceCount : label.weightKg) ? <strong style={{ fontSize: "20pt", lineHeight: 0.9 }}>{label.isCrayfish ? label.pieceCount : label.weightKg}</strong> : <span style={styles.weightWriteLine} />}
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
