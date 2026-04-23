import React from "react";

export const PROCESSED_LABEL_4X3_SIZE_MM = {
  width: 101.6,
  height: 76.2,
};

const palette = {
  text: "#0f172a",
  muted: "#475569",
  border: "#cbd5e1",
  accentBg: "#eff6ff",
  accentBorder: "#93c5fd",
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
    gap: "2mm",
  },
  brandRow: {
    display: "grid",
    gridTemplateColumns: "16mm 1fr 26mm",
    gap: "2mm",
    alignItems: "center",
    paddingBottom: "1.4mm",
    borderBottom: `0.4mm solid ${palette.border}`,
    minWidth: 0,
  },
  logo: {
    width: "15mm",
    maxHeight: "11mm",
    objectFit: "contain",
    display: "block",
  },
  brandTitle: {
    fontSize: "11pt",
    lineHeight: 0.96,
    fontWeight: 900,
    letterSpacing: "-0.03em",
  },
  brandSubtitle: {
    marginTop: "0.6mm",
    fontSize: "6.4pt",
    lineHeight: 1.04,
    fontWeight: 700,
    color: palette.muted,
  },
  ovalWrap: {
    justifySelf: "end",
  },
  content: {
    display: "grid",
    gridTemplateColumns: "1fr 27mm",
    gap: "2.4mm",
    minHeight: 0,
    minWidth: 0,
  },
  left: {
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    minWidth: 0,
  },
  productName: {
    fontSize: "15pt",
    lineHeight: 0.96,
    fontWeight: 900,
    letterSpacing: "-0.03em",
    wordBreak: "break-word",
  },
  batchBox: {
    marginTop: "1.4mm",
    padding: "1.6mm 2mm",
    background: palette.accentBg,
    border: `0.4mm solid ${palette.accentBorder}`,
    borderRadius: "2mm",
  },
  batchLine: {
    fontSize: "8pt",
    lineHeight: 1.02,
    fontWeight: 900,
    wordBreak: "break-word",
  },
  infoGrid: {
    marginTop: "1.5mm",
    display: "grid",
    gap: "0.5mm",
  },
  line: {
    fontSize: "6.8pt",
    lineHeight: 1.04,
    wordBreak: "break-word",
  },
  supplierBlock: {
    marginTop: "auto",
    paddingTop: "1.2mm",
    borderTop: `0.35mm solid ${palette.border}`,
    display: "grid",
    gap: "0.45mm",
  },
  supplierLine: {
    fontSize: "6.2pt",
    lineHeight: 1.04,
    wordBreak: "break-word",
  },
  qrColumn: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    minHeight: 0,
  },
  qrFrame: {
    width: "27mm",
    height: "27mm",
    padding: "0.7mm",
    border: `0.4mm solid ${palette.border}`,
    borderRadius: "1.8mm",
    background: "#fff",
    boxSizing: "border-box",
    marginLeft: "auto",
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
    <div
      style={{
        width: "26mm",
        height: "13mm",
        border: "0.5mm solid #0f172a",
        borderRadius: "999px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#fff",
        lineHeight: 1,
      }}
    >
      <div style={{ fontSize: "5.8pt", fontWeight: 800 }}>FI</div>
      <div style={{ fontSize: "6.8pt", fontWeight: 900, marginTop: "0.3mm" }}>{establishmentNumber}</div>
      <div style={{ fontSize: "5.8pt", fontWeight: 800, marginTop: "0.3mm" }}>EC</div>
    </div>
  );
}

function LabelLine({ label, value, strong = false }) {
  if (!value) return null;
  return (
    <div style={{ ...styles.line, ...(strong ? { fontWeight: 800 } : null) }}>
      {label ? <strong>{label}: </strong> : null}
      <span>{value}</span>
    </div>
  );
}

export default function ProcessedLabel4x3({ label }) {
  if (!label) return null;

  return (
    <div style={styles.root}>
      <div style={styles.brandRow}>
        <div>{label.logoUrl ? <img src={label.logoUrl} alt="Suoraan Kalastajalta" style={styles.logo} /> : null}</div>
        <div style={{ minWidth: 0 }}>
          <div style={styles.brandTitle}>Suoraan Kalastajalta</div>
          <div style={styles.brandSubtitle}>Jalostettu kalatuote</div>
        </div>
        <div style={styles.ovalWrap}>{renderOvalMark(label.establishmentNumber)}</div>
      </div>

      <div style={styles.content}>
        <div style={styles.left}>
          <div style={styles.productName}>{label.productName || "Jalostettu kalatuote"}</div>
          {label.batchId ? (
            <div style={styles.batchBox}>
              <div style={styles.batchLine}>Eratunnus: {label.batchId}</div>
            </div>
          ) : null}

          <div style={styles.infoGrid}>
            <LabelLine label="Raaka-aine" value={label.speciesSummary} />
            <LabelLine label="Tuotetyyppi" value={label.productType} />
            <LabelLine label="Kasittely" value={label.processingMethod} />
            <LabelLine label="Nettopaino" value={label.netWeightText} strong />
            <LabelLine label={label.dateLabel} value={label.dateValue} strong />
            <LabelLine label="Sailytysohje" value={label.storageText} />
            <LabelLine label="Pyyntialue" value={label.catchAreaText} />
            <LabelLine label="Tuotteen tila" value={label.productStateText} />
            <LabelLine label="Ainesosat" value={label.ingredientsText} />
            <LabelLine label="Allergeenit" value={label.allergensText} strong />
          </div>

          <div style={styles.supplierBlock}>
            <div style={styles.supplierLine}><strong>Toimija:</strong> {label.operatorName || "-"}</div>
            {label.operatorAddress ? <div style={styles.supplierLine}>{label.operatorAddress}</div> : null}
          </div>
        </div>

        <div style={styles.qrColumn}>
          <div style={styles.qrFrame}>
            {label.qrImageUrl ? <img src={label.qrImageUrl} alt={`QR ${label.batchId || ""}`} style={styles.qrImage} /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
