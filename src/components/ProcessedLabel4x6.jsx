import React from "react";

export const PROCESSED_LABEL_4X6_SIZE_MM = {
  width: 102,
  height: 152,
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
    gridTemplateRows: "22mm 1fr",
    gap: "2.4mm",
  },
  brand: {
    display: "grid",
    gridTemplateColumns: "18mm 1fr 30mm",
    gap: "3mm",
    alignItems: "center",
    paddingBottom: "2mm",
    borderBottom: `0.45mm solid ${palette.border}`,
    minWidth: 0,
  },
  logo: {
    width: "17mm",
    maxHeight: "15mm",
    objectFit: "contain",
    display: "block",
  },
  brandTitle: {
    fontSize: "16pt",
    lineHeight: 0.95,
    fontWeight: 900,
    letterSpacing: "-0.03em",
  },
  brandSubtitle: {
    marginTop: "0.8mm",
    fontSize: "8pt",
    lineHeight: 1.08,
    fontWeight: 700,
    color: palette.muted,
  },
  main: {
    display: "grid",
    gridTemplateColumns: "1fr 35mm",
    gap: "3.2mm",
    minWidth: 0,
    minHeight: 0,
  },
  mainLeft: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    minHeight: 0,
  },
  productName: {
    fontSize: "24pt",
    lineHeight: 0.92,
    fontWeight: 900,
    letterSpacing: "-0.04em",
    wordBreak: "break-word",
  },
  batchBox: {
    marginTop: "1mm",
    padding: "2.2mm 2.8mm",
    background: palette.accentBg,
    border: `0.45mm solid ${palette.accentBorder}`,
    borderRadius: "2.4mm",
  },
  batchText: {
    fontSize: "11.2pt",
    lineHeight: 1,
    fontWeight: 900,
    wordBreak: "break-word",
  },
  infoGrid: {
    display: "grid",
    gap: "0.9mm",
    marginTop: "1.6mm",
  },
  line: {
    fontSize: "8.7pt",
    lineHeight: 1.08,
    wordBreak: "break-word",
  },
  nutritionBlock: {
    marginTop: "1.2mm",
    padding: "1.8mm 2mm",
    border: `0.35mm solid ${palette.border}`,
    borderRadius: "2mm",
    display: "grid",
    gap: "0.7mm",
  },
  nutritionTitle: {
    fontSize: "8pt",
    lineHeight: 1.04,
    fontWeight: 800,
  },
  nutritionRow: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: "2mm",
    fontSize: "7.6pt",
    lineHeight: 1.05,
  },
  sideColumn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: "2.4mm",
    minWidth: 0,
    minHeight: 0,
  },
  qrFrame: {
    width: "35mm",
    height: "35mm",
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
    gap: "0.8mm",
    alignContent: "start",
    paddingTop: "1.8mm",
    borderTop: `0.45mm solid ${palette.border}`,
  },
  supplierLine: {
    fontSize: "8.1pt",
    lineHeight: 1.08,
    wordBreak: "break-word",
  },
};

function renderOvalMark(establishmentNumber) {
  if (!establishmentNumber) return null;
  return (
    <svg
      width="40mm"
      height="22mm"
      viewBox="0 0 160 90"
      xmlns="http://www.w3.org/2000/svg"
      aria-label={`Laitostunnus ${establishmentNumber}`}
      style={{ display: "block" }}
    >
      <ellipse
        cx="80"
        cy="45"
        rx="72"
        ry="36"
        fill="white"
        stroke="black"
        strokeWidth="2"
      />
      <text
        x="80"
        y="28"
        textAnchor="middle"
        fontFamily="Arial, sans-serif"
        fontSize="14"
        fontWeight="700"
        fill="black"
      >
        FI
      </text>
      <text
        x="80"
        y="50"
        textAnchor="middle"
        fontFamily="Arial, sans-serif"
        fontSize="18"
        fontWeight="700"
        fill="black"
      >
        {establishmentNumber}
      </text>
      <text
        x="80"
        y="72"
        textAnchor="middle"
        fontFamily="Arial, sans-serif"
        fontSize="14"
        fontWeight="700"
        fill="black"
      >
        EC
      </text>
    </svg>
  );
}

function renderHighlightedIngredients(value, allergens) {
  const sourceText = String(value || "").trim();
  if (!sourceText) return null;
  const tokens = String(allergens || "")
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (tokens.length === 0) return sourceText;

  const escapedTokens = tokens.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const matcher = new RegExp(`(${escapedTokens.join("|")})`, "gi");
  const parts = sourceText.split(matcher);
  const lowerCaseTokens = tokens.map((item) => item.toLowerCase());

  return parts.map((part, index) => (
    lowerCaseTokens.includes(String(part || "").toLowerCase())
      ? <strong key={`allergen-${index}`}>{part}</strong>
      : <React.Fragment key={`text-${index}`}>{part}</React.Fragment>
  ));
}

function LabelLine({ label, value, strong = false, content = null }) {
  if (!value && !content) return null;
  return (
    <div style={{ ...styles.line, ...(strong ? { fontWeight: 800 } : null) }}>
      {label ? <strong>{label}: </strong> : null}
      <span>{content || value}</span>
    </div>
  );
}

function NutritionBlock({ rows }) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const energyKj = rows.find((row) => row.key === "energyKj");
  const energyKcal = rows.find((row) => row.key === "energyKcal");
  const otherRows = rows.filter((row) => row.key !== "energyKj" && row.key !== "energyKcal");

  return (
    <div style={styles.nutritionBlock}>
      <div style={styles.nutritionTitle}>Ravintosisalto / 100 g</div>
      {(energyKj || energyKcal) ? (
        <div style={styles.nutritionRow}>
          <span>Energia</span>
          <strong>{[energyKj ? `${energyKj.value} ${energyKj.unit}` : "", energyKcal ? `${energyKcal.value} ${energyKcal.unit}` : ""].filter(Boolean).join(" / ")}</strong>
        </div>
      ) : null}
      {otherRows.map((row) => (
        <div key={row.key} style={styles.nutritionRow}>
          <span>{row.label}</span>
          <strong>{row.value} {row.unit}</strong>
        </div>
      ))}
    </div>
  );
}

export default function ProcessedLabel4x6({ label }) {
  if (!label) return null;

  return (
    <div style={styles.root}>
      <section style={styles.brand}>
        <div>{label.logoUrl ? <img src={label.logoUrl} alt="Suoraan Kalastajalta" style={styles.logo} /> : null}</div>
        <div style={{ minWidth: 0 }}>
          <div style={styles.brandTitle}>Suoraan Kalastajalta</div>
          <div style={styles.brandSubtitle}>Jalostettu kalatuote</div>
        </div>
        <div style={{ justifySelf: "end" }}>{renderOvalMark(label.establishmentNumber)}</div>
      </section>

      <section style={styles.main}>
        <div style={styles.mainLeft}>
          <div style={styles.productName}>{label.productName || "Jalostettu kalatuote"}</div>
          {label.batchId ? (
            <div style={styles.batchBox}>
              <div style={styles.batchText}>Eratunnus: {label.batchId}</div>
            </div>
          ) : null}

          <div style={styles.infoGrid}>
            <LabelLine label="Raaka-aine" value={label.speciesSummary} />
            <LabelLine label="Laji" value={label.speciesNameFi} />
            <LabelLine label="Tieteellinen nimi" value={label.speciesNameScientific} />
            <LabelLine label="Tuotetyyppi" value={label.productType} />
            <LabelLine label="Pyydystyyppi" value={label.gearType} />
            <LabelLine label="Nettopaino" value={label.netWeightText} strong />
            <LabelLine label={label.dateLabel} value={label.dateValue} strong />
            <LabelLine label="Sailytys" value={label.storageTemperatureText} strong />
            <LabelLine label="Sailytysohje" value={label.storageText} />
            <LabelLine label="Pyyntialue" value={label.catchAreaText} />
            <LabelLine label="Tuotteen tila" value={label.productStateText} />
            <LabelLine label="Merkinta" value={label.strongSaltWarningText} strong />
            <LabelLine label="Ainesosat" content={renderHighlightedIngredients(label.ingredientsText, label.allergensText)} />
            <LabelLine label="Allergeenit" value={label.allergensText} strong />
          </div>
          <NutritionBlock rows={label.nutritionRows} />
        </div>

        <div style={styles.sideColumn}>
          <div style={styles.qrFrame}>
            {label.qrImageUrl ? <img src={label.qrImageUrl} alt={`QR ${label.batchId || ""}`} style={styles.qrImage} /> : null}
          </div>
          <div style={styles.supplierBlock}>
            <div style={styles.supplierLine}><strong>Toimija:</strong> {label.operatorName || "-"}</div>
            {label.operatorAddress ? <div style={styles.supplierLine}>{label.operatorAddress}</div> : null}
            {label.operatorEmail ? <div style={styles.supplierLine}>{label.operatorEmail}</div> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
