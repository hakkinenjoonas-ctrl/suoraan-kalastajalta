import React from "react";
import { styles } from "../lib/ui.js";
import { formatSpeciesForSale, isCrayfishSpecies } from "../lib/species.js";

export default function PublicBatchView({ batchId, data, loading, error, onLeave }) {
  const formatPublicQuantity = (row) => {
    if (!row) return "";
    const crayfish = isCrayfishSpecies(row.species || row.species_summary);
    const unit = crayfish ? "kpl" : String(row.unit || "kg");
    const quantity = crayfish
      ? (row.count ?? (unit === "kpl" ? row.quantity : ""))
      : row.quantity;
    return quantity != null && quantity !== "" ? `${quantity} ${unit}` : "";
  };
  const headerSummary = [formatSpeciesForSale(data?.species), formatPublicQuantity(data)]
    .filter(Boolean)
    .join(" · ");
  const saleInfoRows = [
    ["Tarjouksia", data?.sale_info?.offer_count],
    [
      "Viimeisin tarjouspäivitys",
      data?.sale_info?.updated_at ? new Date(data.sale_info.updated_at).toLocaleString("fi-FI") : "",
    ],
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");
  const infoRows = [
    ["Erätunnus", data?.batch_id],
    ["Tila", data?.status],
    ["Laji", formatSpeciesForSale(data?.species)],
    ["Erän lajit", data?.species_summary],
    ["Tuote", data?.product_name],
    ["Käsittelymenetelmä", data?.processing_method],
    ["Pyyntipäivämäärä", data?.catch_date],
    ["Tuotantopäivä", data?.production_date],
    ["Parasta ennen", data?.best_before_date],
    ["Alue", data?.area],
    ["ICES-osa-alue", data?.ices_subdivision],
    ["Tilastoruutu", data?.statistical_rectangle],
    ["Paikka", [data?.municipality, data?.spot].filter(Boolean).join(" / ")],
    ["Pyydys", data?.marine_gear_name || data?.gear],
    ["Merialueen pyydyskoodi", data?.marine_gear_code],
    ["Kalastuspäivätunnus", data?.fishing_day_id],
    ["Määrä", formatPublicQuantity(data)],
    ["Myyjä / jalostaja", data?.seller_name],
    ["Lisätiedot", data?.notes],
    ["Luotu", data?.created_at ? new Date(data.created_at).toLocaleString("fi-FI") : ""],
  ].filter(([, value]) => value);

  const processingRows = [
    ["Tuotetyyppi", data?.related_processing?.product_type],
    ["Pakkauskoko", data?.related_processing?.package_size_g ? `${data.related_processing.package_size_g} g` : ""],
    ["Pakkausten määrä", data?.related_processing?.package_count],
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");

  return (
    <div style={styles.app}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .print-card { box-shadow: none !important; border-color: #cbd5e1 !important; break-inside: avoid; }
        }

        .public-batch-header {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
          flex-wrap: wrap;
        }

        .public-batch-row {
          display: grid;
          grid-template-columns: 220px minmax(0, 1fr);
          gap: 12px;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 8px;
        }

        .public-batch-value {
          min-width: 0;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .public-batch-source {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
          flex-wrap: wrap;
        }

        @media (max-width: 640px) {
          .public-batch-row {
            grid-template-columns: 1fr;
            gap: 4px;
          }

          .public-batch-header {
            gap: 12px;
          }

          .public-batch-source {
            gap: 12px;
          }
        }
      `}</style>
      <div style={{ ...styles.container, maxWidth: 960 }}>
        <div style={{ ...styles.card, ...styles.headerCard, marginBottom: 16, background: "linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)" }} className="print-card">
          <div className="public-batch-header">
            <div>
              <div style={{ fontSize: 14, color: "#1d4ed8", fontWeight: 700, marginBottom: 6 }}>Erän jäljitettävyys</div>
              <h1 style={{ ...styles.title, marginBottom: 8 }}>ERÄTIEDOT</h1>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{batchId}</div>
              {headerSummary ? <div style={{ marginTop: 8, fontSize: 18, color: "#0f172a", fontWeight: 700 }}>{headerSummary}</div> : null}
            </div>
            <div className="no-print" style={styles.row}>
              <button style={styles.button} onClick={onLeave}>
                Palaa sovellukseen
              </button>
              <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => window.print()}>
                Tulosta erätiedot
              </button>
            </div>
          </div>
        </div>

        {loading ? <div style={{ ...styles.card, ...styles.sectionCard }} className="print-card">Haetaan erän tietoja...</div> : null}
        {error ? <div style={{ ...styles.noticeError, marginBottom: 16 }}>{error}</div> : null}

        {!loading && !error && data ? (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }} className="print-card">
              <strong style={{ fontSize: 20 }}>Erän perustiedot</strong>
              {infoRows.map(([label, value]) => (
                <div key={label} className="public-batch-row">
                  <div style={{ color: "#475569", fontWeight: 600 }}>{label}</div>
                  <div className="public-batch-value" style={{ color: "#0f172a" }}>{String(value)}</div>
                </div>
              ))}
            </div>

            {saleInfoRows.length > 0 ? (
              <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }} className="print-card">
                <strong style={{ fontSize: 20 }}>Kauppatiedot</strong>
                {saleInfoRows.map(([label, value]) => (
                  <div key={label} className="public-batch-row">
                    <div style={{ color: "#475569", fontWeight: 600 }}>{label}</div>
                    <div className="public-batch-value" style={{ color: "#0f172a" }}>{String(value)}</div>
                  </div>
                ))}
              </div>
            ) : null}

            {processingRows.length > 0 ? (
              <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }} className="print-card">
                <strong style={{ fontSize: 20 }}>Jalostustiedot</strong>
                {processingRows.map(([label, value]) => (
                  <div key={label} className="public-batch-row">
                    <div style={{ color: "#475569", fontWeight: 600 }}>{label}</div>
                    <div className="public-batch-value" style={{ color: "#0f172a" }}>{String(value)}</div>
                  </div>
                ))}
              </div>
            ) : null}

            {Array.isArray(data?.source_batches) && data.source_batches.length > 0 ? (
              <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }} className="print-card">
                <strong style={{ fontSize: 20 }}>Raaka-aine-erät</strong>
                {data.source_batches.map((source) => (
                  <div key={`${source.batch_id}-${source.source_entry_id || source.species || Math.random()}`} style={{ ...styles.entry, background: "#f8fbff" }}>
                    <div className="public-batch-source">
                      <div style={{ ...styles.stack, gap: 6 }}>
                        <div><strong>Erätunnus:</strong> {source.batch_id || "-"}</div>
                        <div style={styles.muted}><strong>Laji:</strong> {formatSpeciesForSale(source.species)}</div>
                        {source.catch_date ? <div style={styles.muted}><strong>Pyyntipäivämäärä:</strong> {source.catch_date}</div> : null}
                        <div style={styles.muted}><strong>Määrä:</strong> {formatPublicQuantity(source) || "-"}</div>
                      </div>
                      {source.qr_image_url ? (
                        <div className="no-print" style={styles.qrBlock}>
                          <img src={source.qr_image_url} alt={`QR ${source.batch_id || "source"}`} style={styles.qrImage} />
                          <div style={styles.small}>QR-koodi lähde-erälle</div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

          </div>
        ) : null}

      </div>
    </div>
  );
}
