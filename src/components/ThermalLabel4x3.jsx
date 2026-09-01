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
    padding: "3.6mm",
    overflow: "hidden",
    boxSizing: "border-box",
    background: palette.background,
    color: palette.text,
    fontFamily: "\"Avenir Next\", \"Helvetica Neue\", Arial, sans-serif",
    display: "grid",
    gridTemplateColumns: "1fr 30mm",
    gap: "2.4mm",
  },
  rootWithFacility: {
    gridTemplateColumns: "1fr 36mm",
  },
  left: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    minHeight: 0,
  },
  species: {
    fontSize: "20pt",
    fontWeight: 900,
    lineHeight: 0.92,
    letterSpacing: "-0.04em",
    wordBreak: "break-word",
  },
  scientific: {
    marginTop: "0.7mm",
    fontSize: "8.2pt",
    lineHeight: 1.05,
    color: palette.muted,
    fontStyle: "italic",
    wordBreak: "break-word",
  },
  batchBox: {
    marginTop: "1.7mm",
    padding: "1.8mm 2.2mm",
    border: `0.4mm solid ${palette.accentBorder}`,
    borderRadius: "2mm",
    background: palette.accentBg,
  },
  batchText: {
    fontSize: "10.8pt",
    lineHeight: 1,
    fontWeight: 900,
    whiteSpace: "nowrap",
    letterSpacing: "-0.025em",
  },
  infoBlock: {
    marginTop: "1.6mm",
    display: "grid",
    gap: "0.5mm",
  },
  line: {
    fontSize: "7.5pt",
    lineHeight: 1.03,
    wordBreak: "break-word",
  },
  catchDate: {
    fontSize: "8.4pt",
    lineHeight: 1.05,
    fontWeight: 900,
    wordBreak: "break-word",
  },
  supplierBlock: {
    marginTop: "auto",
    paddingTop: "1.1mm",
    borderTop: `0.35mm solid ${palette.border}`,
    display: "grid",
    gap: "0.5mm",
  },
  supplierLine: {
    fontSize: "6.5pt",
    lineHeight: 1.03,
    wordBreak: "break-word",
  },
  right: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 0,
  },
  brandBlock: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    paddingTop: "0.2mm",
    minWidth: 0,
  },
  brandRow: {
    width: "100%",
    display: "grid",
    gridTemplateColumns: "1fr",
    alignItems: "center",
    gap: "0.8mm",
  },
  brandRowWithFacility: {
    gridTemplateColumns: "19mm 1fr",
  },
  ovalWrap: {
    flex: "0 0 auto",
    display: "flex",
    justifyContent: "center",
  },
  logo: {
    width: "13mm",
    height: "auto",
    maxWidth: "13mm",
    maxHeight: "11mm",
    objectFit: "contain",
    display: "block",
    transform: "scale(1.25)",
    transformOrigin: "center",
  },
  brandText: {
    marginTop: "0.3mm",
    fontSize: "6.5pt",
    lineHeight: 1.02,
    fontWeight: 800,
    textAlign: "center",
    color: palette.text,
  },
  qrFrame: {
    width: "29mm",
    height: "29mm",
    border: `0.4mm solid ${palette.border}`,
    borderRadius: "1.8mm",
    padding: "0.8mm",
    background: "#fff",
    boxSizing: "border-box",
  },
  qrBottomBlock: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.7mm",
  },
  crayfishQuantity: {
    width: "100%",
    minHeight: "9mm",
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "baseline",
    gap: "1mm",
    paddingRight: "0.8mm",
    boxSizing: "border-box",
    fontWeight: 900,
    lineHeight: 0.82,
    whiteSpace: "nowrap",
  },
  crayfishQuantityUnit: {
    fontSize: "9pt",
    lineHeight: 1,
    fontWeight: 900,
  },
  crayfishQuantityLabel: {
    fontSize: "7pt",
    lineHeight: 1,
    fontWeight: 700,
  },
  quantityWriteLine: {
    flex: 1,
    minWidth: "8mm",
    height: "4.2mm",
    borderBottom: `0.5mm solid ${palette.text}`,
  },
  qrImage: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block",
  },
};

function renderOvalMark(establishmentNumber) {
  if (!establishmentNumber) return null;
  return (
    <svg
      width="18.75mm"
      height="11.25mm"
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
  const printedQuantity = label.isCrayfish ? label.pieceCount : label.weightKg;
  const hasPrintedQuantity = Boolean(printedQuantity);
  const quantityFontSize = String(printedQuantity || "").length <= 3
    ? "30pt"
    : String(printedQuantity || "").length <= 5
      ? "24pt"
      : "18pt";
  const batchLength = `Erätunnus: ${label.batchId || "-"}`.length;
  const batchFontSize = `${Math.min(10.8, (10.8 * 24) / Math.max(batchLength, 1)).toFixed(2)}pt`;

  return (
    <div style={label.eviraFacilityId ? { ...styles.root, ...styles.rootWithFacility } : styles.root} data-label-root="true">
      <div style={styles.left}>
        <div>
          <div style={styles.species}>{label.species || "-"}</div>
          {label.scientificName ? <div style={styles.scientific}>{label.scientificName}</div> : null}
          <div style={styles.batchBox}>
            <div data-label-single-line="true" style={{ ...styles.batchText, fontSize: batchFontSize, overflow: "hidden" }}>Erätunnus: {label.batchId || "-"}</div>
          </div>
        </div>

        <div style={styles.infoBlock}>
          <InfoLine label="Pyyntialue" value={label.catchArea} />
          <InfoLine value={label.harvestSourceText || label.productionMethodText} />
          <InfoLine label="Pyyntimenetelmä" value={label.gearType} />
          <InfoLine value={label.productStateText} />
          <InfoLine label="Pyyntipäivä" value={label.catchDate} emphasis />
          <InfoLine label="Viimeinen käyttöpäivä" value={label.useByDate} emphasis />
          <InfoLine label="Kaupallisen kalastajan tunnus" value={label.commercialFishingId} />
          <InfoLine label="Säilytys" value={label.storageText} />
        </div>

        <div style={styles.supplierBlock}>
          <div style={styles.supplierLine}>Toimittaja: {label.supplier || "-"}</div>
          {label.supplierAddress ? <div style={styles.supplierLine}>{label.supplierAddress}</div> : null}
          {label.supplierContact ? <div style={styles.supplierLine}>{label.supplierContact}</div> : null}
        </div>
      </div>

      <div style={styles.right}>
        <div style={label.eviraFacilityId ? { ...styles.brandRow, ...styles.brandRowWithFacility } : styles.brandRow}>
          {label.eviraFacilityId ? <div style={styles.ovalWrap}>{renderOvalMark(label.eviraFacilityId)}</div> : null}
          <div style={styles.brandBlock}>
            {label.logoUrl ? <img src={label.logoUrl} alt="Suoraan Kalastajalta" style={styles.logo} /> : null}
            <div style={styles.brandText}>
              <div>Suoraan</div>
              <div>Kalastajalta</div>
            </div>
          </div>
        </div>

        <div style={styles.qrBottomBlock}>
          <div style={styles.crayfishQuantity}>
            <span style={styles.crayfishQuantityLabel}>{label.isCrayfish ? "Määrä:" : "Paino:"}</span>
            {hasPrintedQuantity ? (
              <strong style={{ fontSize: quantityFontSize }}>{printedQuantity}</strong>
            ) : (
              <span style={styles.quantityWriteLine} />
            )}
            <span style={styles.crayfishQuantityUnit}>{label.isCrayfish ? "kpl" : "kg"}</span>
          </div>
          <div style={styles.qrFrame}>
            {label.qrImageUrl ? <img src={label.qrImageUrl} alt={`QR ${label.batchId || ""}`} style={styles.qrImage} /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
