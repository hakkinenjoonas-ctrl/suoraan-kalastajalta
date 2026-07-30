import {
  BUYER_OFFER_ACTION_REQUIRED_STATUSES,
  getBuyerOfferAcceptanceActionLabel,
  hasBuyerOfferStatus,
  isBuyerOfferAccepted,
  isBuyerOfferCountered,
  isBuyerOfferRejected,
  isBuyerOfferReserved,
} from "../lib/offerLogic.js";
import { FISH_VAT_RATE } from "../lib/pricing.js";

function isCrayfishOfferSummary(summary) {
  const text = String(summary || "").toLowerCase();
  return text.includes("täplärapu") ||
    text.includes("jokirapu") ||
    text.includes("pacifastacus leniusculus") ||
    text.includes("astacus astacus");
}

function getCrayfishCountDisplay(summary) {
  const countMatch = String(summary || "").match(/(\d+(?:[.,]\d+)?)\s*kpl/i);
  return countMatch ? `${String(countMatch[1]).replace(".", ",")} kpl` : null;
}

function getOfferAmountDisplay(offer, fallbackValue) {
  if (isCrayfishOfferSummary(offer?.species_summary)) {
    return getCrayfishCountDisplay(offer?.species_summary) || `${fallbackValue} kg`;
  }
  return `${fallbackValue} kg`;
}

function euro(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${number.toLocaleString("fi-FI")} €`;
}

function OfferHeadlineBlock({
  title,
  date,
  quantity,
  accent = "#0f172a",
  background = "#f8fafc",
}) {
  return (
    <div
      style={{
        marginBottom: 10,
        padding: "14px 16px",
        borderRadius: 16,
        background,
        border: "1px solid #dbe4ee",
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1.05, color: accent }}>
        {title || "Kalaerä"}
      </div>
      <div style={{ marginTop: 8, fontSize: 16, fontWeight: 700, color: "#334155" }}>
        {[date, quantity].filter(Boolean).join(" · ") || "-"}
      </div>
    </div>
  );
}

function BatchIdLine({ batchId, styles, strongLabel = true }) {
  if (!batchId) return null;
  return (
    <div
      style={{
        ...styles.muted,
        fontSize: 12,
        lineHeight: 1.35,
        overflowWrap: "anywhere",
        wordBreak: "break-word",
      }}
    >
      {strongLabel ? <strong>Erätunnus:</strong> : "Erätunnus:"}{" "}
      <span>{batchId}</span>
    </div>
  );
}

function CounterOfferHighlight({ offer, netPriceLabel, grossPriceLabel }) {
  if (offer?.counter_price_per_kg === "" || offer?.counter_price_per_kg == null) return null;

  const vatLabel = (FISH_VAT_RATE * 100).toLocaleString("fi-FI", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const isAccepted = isBuyerOfferAccepted(offer?.status);

  return (
    <div
      style={{
        marginTop: 10,
        marginBottom: 10,
        padding: "14px 16px",
        borderRadius: 14,
        background: isAccepted ? "#ecfdf5" : "#eff6ff",
        border: `2px solid ${isAccepted ? "#86efac" : "#93c5fd"}`,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 800,
          letterSpacing: "0.03em",
          textTransform: "uppercase",
          color: isAccepted ? "#166534" : "#1d4ed8",
          marginBottom: 8,
        }}
      >
        {isAccepted ? "Hyväksytty kauppahinta" : "Ostajan vastatarjous"}
      </div>
      <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.15, color: "#0f172a", marginBottom: 6 }}>
        Vastatarjous ALV 0 %: {netPriceLabel(offer.counter_price_per_kg)}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.2, color: "#334155" }}>
        {`Vastatarjous sis. ALV ${vatLabel} %:`} {grossPriceLabel(offer.counter_price_per_kg)}
      </div>
    </div>
  );
}

export function WholesaleOffersOverviewSection({
  actionRequiredCount,
  openEntriesCount,
  acceptedCount,
  archivedCount,
  styles,
}) {
  return (
    <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
      <strong>Tilannekuva</strong>
      <div style={styles.muted}>Tärkeimmät asiat näkyvät ensin, jotta tiedät heti mihin pitää reagoida.</div>
      <div style={styles.entryBadges}>
        <span style={{ ...styles.badge, background: "#eff6ff", borderColor: "#93c5fd", color: "#1d4ed8" }}>{actionRequiredCount} vaatii toimenpiteitä</span>
        <span style={styles.badge}>{openEntriesCount} avoinna</span>
        <span style={{ ...styles.badge, background: "#ecfdf5", borderColor: "#86efac", color: "#166534" }}>{acceptedCount} hyväksyttyä</span>
        <span style={{ ...styles.badge, background: "#f8fafc", borderColor: "#cbd5e1", color: "#475569" }}>{archivedCount} arkistossa</span>
      </div>
    </div>
  );
}

export function LinkedBuyerOfferCard({
  linkedBuyerOffer,
  buyerStatusLabel,
  shouldRevealBuyerIdentity,
  buyerTypeLabel,
  formatSpeciesSummaryText,
  getOfferSummaryCatchDates,
  isMixedOffer,
  getOfferSummaryBatchItems,
  getBatchQrImageUrl,
  styles,
}) {
  if (!linkedBuyerOffer) return null;

  return (
    <div id={`linked-buyer-offer-${linkedBuyerOffer.id}`} style={{ ...styles.card, ...styles.sectionCard, ...styles.stack, background: "#eff6ff", border: "2px solid #2563eb", boxShadow: "0 0 0 4px rgba(37, 99, 235, 0.16), 0 10px 28px rgba(15,23,42,0.10)" }}>
      <div style={styles.rowBetween}>
        <strong>Avattu linkistä</strong>
        <span style={{ ...styles.badge, background: "#dbeafe", borderColor: "#93c5fd", color: "#1d4ed8" }}>{buyerStatusLabel(linkedBuyerOffer.status)}</span>
      </div>
      <div style={styles.muted}><strong>Erä:</strong> {formatSpeciesSummaryText(linkedBuyerOffer.species_summary, { hideTraceability: true }) || "-"}</div>
      {getOfferSummaryCatchDates(linkedBuyerOffer.species_summary).length > 0 ? <div style={styles.muted}><strong>Pyyntipäivämäärä:</strong> {getOfferSummaryCatchDates(linkedBuyerOffer.species_summary).join(", ")}</div> : null}
      {isMixedOffer(linkedBuyerOffer)
        ? getOfferSummaryBatchItems(linkedBuyerOffer.species_summary).map((item) => (
          <div key={`${linkedBuyerOffer.id}-${item.batchId || item.label}`} style={{ ...styles.entry, background: "#fff", padding: 12 }}>
            <div style={styles.muted}><strong>{item.label || "Erä"}</strong></div>
            {item.catchDate ? <div style={styles.muted}><strong>Pyyntipäivämäärä:</strong> {item.catchDate}</div> : null}
            <BatchIdLine batchId={item.batchId} styles={styles} />
            {item.batchId ? <div style={{ ...styles.qrBlock, marginTop: 8 }}><img src={getBatchQrImageUrl(item.batchId)} alt={`QR ${item.batchId}`} style={styles.qrImage} /><div style={styles.small}>QR-koodi erälle</div></div> : null}
          </div>
        ))
        : (
          <>
            {getOfferSummaryBatchItems(linkedBuyerOffer.species_summary)[0]?.catchDate ? <div style={styles.muted}><strong>Pyyntipäivämäärä:</strong> {getOfferSummaryBatchItems(linkedBuyerOffer.species_summary)[0].catchDate}</div> : null}
            <BatchIdLine batchId={linkedBuyerOffer.batch_id} styles={styles} />
          </>
        )}
      <div style={styles.muted}><strong>Ostaja:</strong> {shouldRevealBuyerIdentity(linkedBuyerOffer.status) ? (linkedBuyerOffer.buyer_company_name || linkedBuyerOffer.buyer_email || "Ostaja") : buyerTypeLabel(linkedBuyerOffer.buyer_type)}</div>
      {linkedBuyerOffer.buyer_message ? <div style={styles.muted}><strong>Viesti:</strong> {linkedBuyerOffer.buyer_message}</div> : null}
      <div style={styles.muted}>Tarjous näkyy myös alempana ostajien vastauksissa ja erän omassa tarjouslistassa.</div>
    </div>
  );
}

export function OfferedEntriesSummarySection({
  offeredEntriesSummary,
  jumpToEntryOffer,
  onRemoveEntryFromSale,
  buyerStatusBadgeStyle,
  styles,
  title = "Myyntiin lähetetyt erät",
  infoText = "Tässä näkyvät kaikki myyntiin merkityt saaliit heti, vaikka yksikään ostaja ei olisi vielä vastannut tai tehnyt varausta.",
  emptyText = "Ei vielä myyntiin merkittyjä eriä.",
}) {
  return (
    <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
      <strong>{title}</strong>
      <div style={styles.noticeInfo}>{infoText}</div>
      {offeredEntriesSummary.length === 0 ? (
        <div style={styles.muted}>{emptyText}</div>
      ) : (
        offeredEntriesSummary.map((item) => (
          <div key={item.id} style={{ ...styles.entry, background: "#f8fafc" }}>
            <OfferHeadlineBlock
              title={item.species}
              date={item.date || "-"}
              quantity={item.kilos ? `${item.kilos} kg` : "-"}
            />
            <div style={styles.entryBadges}>
              {item.reservationStatus === "reserved" ? <span style={buyerStatusBadgeStyle("reserved", styles.badge)}>Varattu</span> : null}
              {item.reservationStatus === "" ? <span style={styles.badge}>Odottaa ostajia</span> : null}
              {item.reservationStatus === "reserved" ? (
                <button
                  type="button"
                  style={{ ...styles.button, padding: "8px 12px" }}
                  onClick={() => jumpToEntryOffer(item.id)}
                >
                  Siirry hyväksymään/hylkäämään varaus
                </button>
              ) : null}
              {item.reservationStatus === "" ? (
                <button
                  type="button"
                  style={{ ...styles.button, padding: "8px 12px", background: "#fee2e2", borderColor: "#fca5a5", color: "#b91c1c" }}
                  onClick={() => onRemoveEntryFromSale(item.entryIds || [item.id])}
                >
                  Poista myynnistä
                </button>
              ) : null}
            </div>
            <div style={styles.muted}>{item.date || "-"} · {item.area || "-"}</div>
            {item.mixedSummary ? <div style={styles.muted}>Lajit samassa erässä: {item.mixedSummary}</div> : null}
            <div style={styles.muted}>Tarjous lähetetty {item.buyerCount} ostajalle</div>
          </div>
        ))
      )}
    </div>
  );
}

function grossPriceLabel(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${euro(number * (1 + FISH_VAT_RATE))} / kg`;
}

function netPriceLabel(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${euro(number)} / kg`;
}

function getEffectiveOfferPrice(offer) {
  if (offer?.counter_price_per_kg !== "" && offer?.counter_price_per_kg != null) {
    return offer.counter_price_per_kg;
  }
  if (offer?.price_per_kg !== "" && offer?.price_per_kg != null) {
    return offer.price_per_kg;
  }
  if (offer?.offer_price_per_kg !== "" && offer?.offer_price_per_kg != null) {
    return offer.offer_price_per_kg;
  }
  return null;
}

export function BuyerResponsesSection({
  prioritizedBuyerResponses,
  requestedOfferId,
  buyers,
  buyerStatusLabel,
  buyerStatusBadgeStyle,
  shouldRevealBuyerIdentity,
  buyerTypeLabel,
  formatSpeciesSummaryText,
  getOfferSummaryCatchDates,
  isMixedOffer,
  getOfferSummaryBatchItems,
  getBatchQrImageUrl,
  euro,
  canManageBuyerOffer,
  onUpdateBuyerOfferStatus,
  onCreateDeliveryNote,
  styles,
  formatOfferDate,
  title = "Ostajien vastaukset ja varaukset",
  infoText = "Tässä näkyvät ensin ostajien varaukset ja vastatarjoukset. Näin näet heti, mihin eriin pitää reagoida. Hyväksytyt ja hylätyt näkyvät niiden jälkeen.",
  emptyText = "Ei vielä ostajien vastauksia.",
  maxItems = 20,
}) {
  return (
    <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
      <strong>{title}</strong>
      <div style={styles.noticeInfo}>{infoText}</div>
      {prioritizedBuyerResponses.length === 0 ? (
        <div style={styles.muted}>{emptyText}</div>
      ) : (
        prioritizedBuyerResponses.slice(0, maxItems).map((offer) => {
          const isAccepted = isBuyerOfferAccepted(offer.status);
          const isReserved = isBuyerOfferReserved(offer.status);
          const isCountered = isBuyerOfferCountered(offer.status);
          const revealIdentity = shouldRevealBuyerIdentity(offer.status);
          const isLinkedOffer = requestedOfferId && offer.id === requestedOfferId;
          const buyerProfile = buyers.find(
            (buyer) => buyer.id === offer.buyer_id || buyer.email === (offer.buyer_email || "").toLowerCase(),
          );
          const deliveryNoteOffer = {
            ...offer,
            buyer_delivery_address: offer.buyer_delivery_address || buyerProfile?.delivery_address || "",
            buyer_delivery_postcode: offer.buyer_delivery_postcode || buyerProfile?.delivery_postcode || "",
            buyer_delivery_city: offer.buyer_delivery_city || buyerProfile?.delivery_city || "",
            buyer_phone: offer.buyer_phone || buyerProfile?.phone || "",
            buyer_contact_name: offer.buyer_contact_name || buyerProfile?.contact_name || "",
            buyer_email: offer.buyer_email || buyerProfile?.email || "",
            buyer_business_id: offer.buyer_business_id || buyerProfile?.business_id || "",
          };
          const buyerDeliveryAddressText = [
            offer.buyer_delivery_address || buyerProfile?.delivery_address || "",
            offer.buyer_delivery_postcode || buyerProfile?.delivery_postcode || "",
            offer.buyer_delivery_city || buyerProfile?.delivery_city || "",
          ].filter(Boolean).join(", ");
          return (
            <div
              key={offer.id}
              style={{
                ...styles.entry,
                background: isLinkedOffer ? "#eff6ff" : isAccepted ? "#ecfeff" : isReserved ? "#eff6ff" : isCountered ? "#f8fbff" : "#fff",
                borderLeft: `4px solid ${isLinkedOffer ? "#1d4ed8" : isAccepted ? "#0891b2" : isReserved ? "#2563eb" : isCountered ? "#0ea5e9" : "#0f172a"}`,
              }}
            >
              <div style={{ ...styles.rowBetween, marginBottom: 8 }}>
                <strong>{formatOfferDate(offer.updated_at || offer.created_at)}</strong>
                <div style={styles.entryBadges}>
                  {isLinkedOffer ? <span style={{ ...styles.badge, background: "#dbeafe", borderColor: "#93c5fd", color: "#1d4ed8" }}>Avattu linkistä</span> : null}
                  <span style={buyerStatusBadgeStyle(offer.status, styles.badge)}>{buyerStatusLabel(offer.status)}</span>
                  <span style={styles.badge}>{revealIdentity ? (offer.buyer_company_name || offer.buyer_email || "Ostaja") : buyerTypeLabel(offer.buyer_type)}</span>
                </div>
              </div>
              <div>
                <OfferHeadlineBlock
                  title={isMixedOffer(offer) ? "Monilajinen erä" : (formatSpeciesSummaryText(offer.species_summary, { hideCatchDate: true, hideTraceability: true }) || "Kalaerä")}
                  date={getOfferSummaryCatchDates(offer.species_summary).join(", ") || "-"}
                  quantity={getOfferAmountDisplay(offer, offer.total_kilos)}
                  accent={isAccepted ? "#0f766e" : "#0f172a"}
                  background={isAccepted ? "#f0fdfa" : "#f8fafc"}
                />
                <div style={styles.muted}><strong>Erä:</strong> {formatSpeciesSummaryText(offer.species_summary, { hideTraceability: true }) || "-"}</div>
                {getOfferSummaryCatchDates(offer.species_summary).length > 0 ? <div style={styles.muted}><strong>Pyyntipäivämäärä:</strong> {getOfferSummaryCatchDates(offer.species_summary).join(", ")}</div> : null}
                {isMixedOffer(offer)
                  ? getOfferSummaryBatchItems(offer.species_summary).map((item) => (
                    <div key={`${offer.id}-${item.batchId || item.label}`} style={{ ...styles.entry, background: "#fff", padding: 12, marginTop: 8, marginBottom: 8 }}>
                      <div style={styles.muted}><strong>{item.label || "Erä"}</strong></div>
                      {item.catchDate ? <div style={styles.muted}><strong>Pyyntipäivämäärä:</strong> {item.catchDate}</div> : null}
                      <BatchIdLine batchId={item.batchId} styles={styles} />
                      {item.batchId ? <div style={{ ...styles.qrBlock, marginTop: 8 }}><img src={getBatchQrImageUrl(item.batchId)} alt={`QR ${item.batchId}`} style={styles.qrImage} /><div style={styles.small}>QR-koodi erälle</div></div> : null}
                    </div>
                  ))
                  : (
                    <>
                      <BatchIdLine batchId={offer.batch_id} styles={styles} />
                    </>
                  )}
                {!isMixedOffer(offer) && offer.batch_id ? <div style={{ ...styles.qrBlock, marginTop: 8, marginBottom: 8 }}><img src={getBatchQrImageUrl(offer.batch_id)} alt={`QR ${offer.batch_id}`} style={styles.qrImage} /><div style={styles.small}>QR-koodi erälle</div></div> : null}
                <div style={styles.muted}><strong>Määrä:</strong> {getOfferAmountDisplay(offer, offer.total_kilos)}</div>
                <CounterOfferHighlight
                  offer={offer}
                  netPriceLabel={netPriceLabel}
                  grossPriceLabel={grossPriceLabel}
                />
                {offer.reserved_kilos !== "" && offer.reserved_kilos != null ? <div style={styles.muted}><strong>Varattu:</strong> {getOfferAmountDisplay(offer, offer.reserved_kilos)}</div> : null}
                {offer.buyer_message ? <div style={styles.muted}><strong>Viesti:</strong> {offer.buyer_message}</div> : null}
                {revealIdentity ? <div style={styles.muted}><strong>Ostaja:</strong> {offer.buyer_company_name || offer.buyer_contact_name || offer.buyer_email || "-"}</div> : null}
                {revealIdentity && offer.buyer_business_id ? <div style={styles.muted}><strong>Y-tunnus:</strong> {offer.buyer_business_id}</div> : null}
                {revealIdentity ? <div style={styles.muted}><strong>Yhteystiedot:</strong> {offer.buyer_contact_name || "-"} · {offer.buyer_email || "-"}{offer.buyer_phone ? ` · ${offer.buyer_phone}` : ""}</div> : null}
                {revealIdentity && buyerDeliveryAddressText ? (
                  <div style={{ marginTop: 10, fontSize: 18, fontWeight: 800, lineHeight: 1.25, color: "#0f172a" }}>
                    Voit nyt toimittaa kalaerän osoitteeseen: {buyerDeliveryAddressText}
                  </div>
                ) : null}
                {revealIdentity && buyerDeliveryAddressText ? (
                  <div style={styles.muted}><strong>Toimitusosoite:</strong> {buyerDeliveryAddressText}</div>
                ) : null}
                {isBuyerOfferAccepted(offer.status) ? (
                  <div style={styles.muted}>
                    <strong>Laskutus:</strong> Tiedot tästä kaupasta siirtyvät Laskutus-välilehdelle heti kun ostaja on vahvistanut erän vastaanotetuksi. Siellä voit muodostaa laskun ostajalle. Suoraan Kalastajalta perii 3 % komission hyväksytyistä kaupoista ja laskuttaa komissiot kuukausittain.
                  </div>
                ) : null}
                {isAccepted && canManageBuyerOffer(offer) && onCreateDeliveryNote ? (
                  <div style={{ ...styles.entry, background: "#eff6ff", padding: 12, marginTop: 12 }}>
                    <strong>Luo lähetyslista</strong>
                    <div style={styles.small}>A4 sisältää täydet jäljitettävyystiedot. MUNBYN-koot sopivat lämpötulostimelle.</div>
                    <div style={{ ...styles.row, marginTop: 8 }}>
                      <button
                        type="button"
                        style={{ ...styles.button, ...styles.primaryButton }}
                        onClick={() => onCreateDeliveryNote(deliveryNoteOffer, null, "a4")}
                      >
                        A4
                      </button>
                      <button type="button" style={styles.button} onClick={() => onCreateDeliveryNote(deliveryNoteOffer, null, "munbyn_4x3")}>MUNBYN 4×3</button>
                      <button type="button" style={styles.button} onClick={() => onCreateDeliveryNote(deliveryNoteOffer, null, "munbyn_4x6")}>MUNBYN 4×6</button>
                    </div>
                  </div>
                ) : null}
                {canManageBuyerOffer(offer) && !isBuyerOfferAccepted(offer.status) && !isBuyerOfferRejected(offer.status) ? (
                  <div style={{ ...styles.row, marginTop: 12 }}>
                    <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => onUpdateBuyerOfferStatus(offer, "accepted")}>
                      {getBuyerOfferAcceptanceActionLabel(offer.status)}
                    </button>
                    <button style={styles.button} onClick={() => onUpdateBuyerOfferStatus(offer, "rejected")}>Hylkää</button>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

export function OfferedEntriesDetailsSection({
  groupedBuyerOffers,
  openBuyerOfferStatuses,
  requestedOfferId,
  buyers,
  profile,
  buyerStatusLabel,
  buyerStatusBadgeStyle,
  shouldRevealBuyerIdentity,
  buyerTypeLabel,
  formatSpeciesSummaryText,
  getOfferSummaryCatchDates,
  isMixedOffer,
  getOfferSummaryBatchItems,
  getBatchQrImageUrl,
  formatCatchGearDisplay,
  formatDeliveryPrice,
  euro,
  calculateCommissionDetails,
  fulfillmentStatusLabel,
  onUpdateBuyerOfferStatus,
  onUpdateOfferStatus,
  updateFulfillmentStatus,
  onCreateDeliveryNote,
  canManageBuyerOffer,
  styles,
  formatOfferDate,
  COMMISSION_RATE,
  formatSpeciesForSale,
  title = "Myyntiin merkityt erät",
}) {
  return (
    <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
      <strong>{title}</strong>

      {groupedBuyerOffers.length === 0 ? (
        <div style={styles.muted}>Ei vielä myyntiin merkittyjä eriä.</div>
      ) : (
        groupedBuyerOffers.map(({ entry, reservation, entryOffers, buyerMatches }) => {
          const openBuyerOffers = buyerMatches.filter((offer) => openBuyerOfferStatuses.includes(offer.status));
          const answeredBuyerOffers = buyerMatches.filter((offer) => hasBuyerOfferStatus(offer.status, [...BUYER_OFFER_ACTION_REQUIRED_STATUSES, "accepted", "rejected"]));
          return (
            <div key={entry.id} id={`offer-entry-${entry.id}`} style={styles.entry}>
              <div style={styles.entryHeader}>
                <div>
                  <OfferHeadlineBlock
                    title={formatSpeciesForSale(entry.species)}
                    date={entry.date || "-"}
                    quantity={entry.kilos !== "" && entry.kilos != null ? `${entry.kilos} kg` : "-"}
                  />
                  <div style={styles.entryBadges}>
                    <span style={styles.badge}>{entry.ownerName}</span>
                    {reservation?.status === "reserved" ? <span style={buyerStatusBadgeStyle("reserved", styles.badge)}>Varattu</span> : null}
                    {reservation?.status === "accepted" ? <span style={buyerStatusBadgeStyle("accepted", styles.badge)}>Myyty</span> : null}
                    {entry.offerToShops ? <span style={styles.badge}>Kauppoihin</span> : null}
                    {entry.offerToRestaurants ? <span style={styles.badge}>Ravintoloihin</span> : null}
                    {entry.offerToWholesalers ? <span style={styles.badge}>Tukkuihin</span> : null}
                  </div>
                  <div style={styles.muted}>{entry.date} · {entry.area}{entry.municipality ? ` · ${entry.municipality}` : ""}{entry.spot ? ` / ${entry.spot}` : ""}</div>
                  {entry.landingPlace ? <div style={styles.muted}>Purkamispaikka: {entry.landingPlace}</div> : null}
                  <BatchIdLine batchId={entry.batchId} styles={styles} strongLabel={false} />
                  {entry.batchId ? <div style={styles.qrBlock}><img src={getBatchQrImageUrl(entry.batchId)} alt={`QR ${entry.batchId}`} style={styles.qrImage} /><div style={styles.small}>QR-koodi erälle</div></div> : null}
                  <div style={styles.muted}>Pyydys: {formatCatchGearDisplay(entry)}</div>
                  {entry.gearCount ? <div style={styles.muted}>Pyydysten määrä: {entry.gearCount}</div> : null}
                  {entry.fishingDurationDays ? <div style={styles.muted}>Pyyntiaika: {entry.fishingDurationDays}</div> : null}
                  {reservation ? (
                    <div style={styles.muted}>
                      {reservation.status === "reserved"
                        ? `Erä on varattu. Varannut: ${shouldRevealBuyerIdentity(reservation.status) ? (reservation.buyer_company_name || reservation.buyer_email || "ostaja") : buyerTypeLabel(reservation.buyer_type)}`
                        : `Erä on myyty. Ostaja: ${shouldRevealBuyerIdentity(reservation.status) ? (reservation.buyer_company_name || reservation.buyer_email || "ostaja") : buyerTypeLabel(reservation.buyer_type)}`}
                    </div>
                  ) : null}
                  <div style={styles.muted}>Toimitus: {entry.deliveryMethod || "-"} · {entry.deliveryArea || "-"} · Kulu {entry.deliveryCost !== "" && entry.deliveryCost != null ? `${entry.deliveryCost} €` : "-"} · Aikaisin {entry.earliestDeliveryDate || "-"} · Kylmäkuljetus {entry.coldTransport ? "kyllä" : "ei"}</div>
                  {entry.commercialFishingId ? <div style={styles.muted}>Kaupallisen kalastajan tunnus: {entry.commercialFishingId}</div> : null}
                </div>
              </div>

              <div style={{ ...styles.stack, marginTop: 12 }}>
                <div style={styles.small}>Suorat tarjoukset tälle erälle: {entryOffers.length}</div>
                <div style={styles.small}>Tarjous lähetetty {buyerMatches.length} ostajalle</div>
                {reservation?.status === "reserved" ? <div style={styles.noticeInfo}>Erä on tällä hetkellä varattu. Voit hyväksyä varauksen tai hylätä sen ostajien vastauksista.</div> : null}
                {reservation?.status === "reserved" ? <div style={styles.noticeInfo}>Ostajan nimi ja yhteystiedot näkyvät vasta, kun hyväksyt varauksen.</div> : null}
                {reservation?.status === "accepted" ? <div style={styles.noticeSuccess}>Erä on merkitty myydyksi hyväksytyn varauksen perusteella.</div> : null}
                <div style={styles.small}>Avoimia tarjouksia: {openBuyerOffers.length}</div>
                {openBuyerOffers.length === 0 ? (
                  <div style={styles.muted}>Ei tällä hetkellä avoimia tarjouksia.</div>
                ) : (
                  openBuyerOffers.map((offer) => (
                    <div key={offer.id} style={{ ...styles.entry, background: "#f8fafc" }}>
                      <div style={styles.entryHeader}>
                        <div>
                          <div style={styles.entryBadges}>
                            <span style={buyerStatusBadgeStyle(offer.status, styles.badge)}>{buyerStatusLabel(offer.status)}</span>
                            <span style={styles.badge}>{buyerTypeLabel(offer.buyer_type)}</span>
                            {offer.delivery_destination_city ? <span style={styles.badge}>{offer.delivery_destination_city}</span> : null}
                          </div>
                          <div style={styles.muted}>{formatOfferDate(offer.updated_at || offer.created_at)}</div>
                          <div style={styles.muted}>Tarjous on lähetetty ostajalle ja odottaa vastausta.</div>
                          {offer.route_price_eur !== "" && offer.route_price_eur != null ? <div style={styles.muted}>Toimitushinta: {formatDeliveryPrice(offer.route_price_eur)}</div> : null}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                {entryOffers.map((offer) => (
                  <div key={offer.id} style={{ ...styles.entry, background: "#f8fafc" }}>
                    <div style={styles.entryHeader}>
                      <div>
                        <div style={styles.entryBadges}>
                          <span style={styles.badge}>Anonyymi ostajaehdokas</span>
                          <span style={styles.badge}>{euro(getEffectiveOfferPrice(offer) || 0)} / kg ALV 0 %</span>
                          <span style={styles.badge}>{grossPriceLabel(getEffectiveOfferPrice(offer) || 0)} sis. ALV {(FISH_VAT_RATE * 100).toLocaleString("fi-FI", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %</span>
                          <span style={styles.badge}>{offer.status}</span>
                        </div>
                        <div style={styles.muted}>Tarjous on tallennettu anonyymisti ilman vastaanottajan tunnistetietoja tähän näkymään.</div>
                        {offer.message ? <div style={styles.muted}>{offer.message}</div> : null}
                      </div>
                      {profile?.role === "owner" || profile?.id === entry.ownerUserId ? (
                        <div style={styles.row}>
                          <button style={styles.button} onClick={() => onUpdateOfferStatus(offer, "accepted")}>Hyväksy</button>
                          <button style={styles.button} onClick={() => onUpdateBuyerOfferStatus(offer, "rejected")}>Hylkää</button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}

                <div style={styles.small}>Vastauksia: {answeredBuyerOffers.length}</div>
                {answeredBuyerOffers.length === 0 ? (
                  <div style={styles.muted}>Ei vielä ostajien vastauksia.</div>
                ) : (
                  answeredBuyerOffers
                    .sort((a, b) => {
                      if (requestedOfferId) {
                        if (a.id === requestedOfferId && b.id !== requestedOfferId) return -1;
                        if (b.id === requestedOfferId && a.id !== requestedOfferId) return 1;
                      }
                      return new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime();
                    })
                    .map((offer) => {
                      const isAccepted = isBuyerOfferAccepted(offer.status);
                      const showTraceability = isAccepted;
                      const revealIdentity = shouldRevealBuyerIdentity(offer.status);
                      const buyerIdentity = revealIdentity ? (offer.buyer_company_name || offer.buyer_email || "Ostaja") : buyerTypeLabel(offer.buyer_type);
                      const isLinkedOffer = requestedOfferId && offer.id === requestedOfferId;
                      const buyerProfile = buyers.find(
                        (buyer) => buyer.id === offer.buyer_id || buyer.email === (offer.buyer_email || "").toLowerCase(),
                      );
                      const buyerDeliveryAddressText = [
                        offer.buyer_delivery_address || buyerProfile?.delivery_address || "",
                        offer.buyer_delivery_postcode || buyerProfile?.delivery_postcode || "",
                        offer.buyer_delivery_city || buyerProfile?.delivery_city || "",
                      ].filter(Boolean).join(", ");
                      const buyerBillingAddressText = [
                        offer.buyer_billing_address || buyerProfile?.billing_address || "",
                        offer.buyer_billing_postcode || buyerProfile?.billing_postcode || "",
                        offer.buyer_billing_city || buyerProfile?.billing_city || "",
                      ].filter(Boolean).join(", ");
                      const buyerBillingEmail = offer.buyer_billing_email || buyerProfile?.billing_email || "";
                      const buyerBusinessId = offer.buyer_business_id || buyerProfile?.business_id || "";

                      return (
                        <div
                          key={offer.id}
                          style={{
                            ...styles.entry,
                            background: isLinkedOffer ? "#eff6ff" : isAccepted ? "#ecfdf5" : "#f8fafc",
                            borderLeft: `4px solid ${isLinkedOffer ? "#1d4ed8" : isAccepted ? "#16a34a" : "#0f172a"}`,
                          }}
                        >
                          <div style={{ ...styles.rowBetween, marginBottom: 10 }}>
                            <strong>{formatOfferDate(offer.updated_at || offer.created_at)}</strong>
                            <div style={styles.entryBadges}>
                              {isLinkedOffer ? <span style={{ ...styles.badge, background: "#dbeafe", borderColor: "#93c5fd", color: "#1d4ed8" }}>Avattu linkistä</span> : null}
                              <span style={buyerStatusBadgeStyle(offer.status, styles.badge)}>
                                {buyerStatusLabel(offer.status)}
                              </span>
                              <span style={styles.badge}>{buyerIdentity}</span>
                            </div>
                          </div>

                          <div style={{ ...styles.grid2, marginBottom: 10 }}>
                            <div>
                              <OfferHeadlineBlock
                                title={isMixedOffer(offer) ? "Monilajinen erä" : (formatSpeciesSummaryText(offer.species_summary, { hideCatchDate: true, hideTraceability: true }) || "Kalaerä")}
                                date={getOfferSummaryCatchDates(offer.species_summary).join(", ") || "-"}
                                quantity={getOfferAmountDisplay(offer, offer.total_kilos)}
                                accent={isAccepted ? "#166534" : "#0f172a"}
                                background={isAccepted ? "#f0fdf4" : "#f8fafc"}
                              />
                              <div style={styles.muted}>
                                <strong>Erä:</strong> {formatSpeciesSummaryText(offer.species_summary, { hideCatchDate: !isMixedOffer(offer), hideTraceability: true }) || "-"}
                              </div>
                              {getOfferSummaryCatchDates(offer.species_summary).length > 0 ? <div style={styles.muted}><strong>Pyyntipäivämäärä:</strong> {getOfferSummaryCatchDates(offer.species_summary).join(", ")}</div> : null}
                              {isMixedOffer(offer)
                                ? getOfferSummaryBatchItems(offer.species_summary).map((item) => (
                                  <div key={`${offer.id}-${item.batchId || item.label}`} style={{ ...styles.entry, background: "#fff", padding: 12, marginTop: 8, marginBottom: 8 }}>
                                    <div style={styles.muted}><strong>{item.label || "Erä"}</strong></div>
                                    {item.catchDate ? <div style={styles.muted}><strong>Pyyntipäivämäärä:</strong> {item.catchDate}</div> : null}
                                    {showTraceability ? <BatchIdLine batchId={item.batchId} styles={styles} /> : null}
                                    {showTraceability && item.batchId ? <div style={{ ...styles.qrBlock, marginTop: 8 }}><img src={getBatchQrImageUrl(item.batchId)} alt={`QR ${item.batchId}`} style={styles.qrImage} /><div style={styles.small}>QR-koodi erälle</div></div> : null}
                                  </div>
                                ))
                                : (
                                  <>
                                    {showTraceability ? <BatchIdLine batchId={offer.batch_id} styles={styles} /> : null}
                                  </>
                                )}
                              {!isMixedOffer(offer) && showTraceability && offer.batch_id ? <div style={{ ...styles.qrBlock, marginTop: 8, marginBottom: 8 }}><img src={getBatchQrImageUrl(offer.batch_id)} alt={`QR ${offer.batch_id}`} style={styles.qrImage} /><div style={styles.small}>QR-koodi erälle</div></div> : null}
                              <div style={styles.muted}><strong>Määrä:</strong> {getOfferAmountDisplay(offer, offer.total_kilos)}</div>
                              <div style={styles.muted}><strong>Alue:</strong> {offer.area || "-"}{entry.municipality ? ` · ${entry.municipality}` : ""}{offer.spot ? ` / ${offer.spot}` : ""}</div>
                            </div>
                            <div>
                              <CounterOfferHighlight
                                offer={offer}
                                netPriceLabel={netPriceLabel}
                                grossPriceLabel={grossPriceLabel}
                              />
                              {isBuyerOfferAccepted(offer.status) ? <div style={styles.muted}><strong>Kaupan arvo:</strong> {euro(calculateCommissionDetails(offer).tradeValue)}</div> : null}
                              {isBuyerOfferAccepted(offer.status) ? <div style={styles.muted}><strong>Komissio ({(COMMISSION_RATE * 100).toFixed(1)} %):</strong> {euro(calculateCommissionDetails(offer).commissionValue)}</div> : null}
                              <div style={styles.muted}><strong>Varattu:</strong> {offer.reserved_kilos !== "" && offer.reserved_kilos != null ? getOfferAmountDisplay(offer, offer.reserved_kilos) : "-"}</div>
                              <div style={styles.muted}><strong>Pyydys:</strong> {formatCatchGearDisplay(entry)}</div>
                            </div>
                          </div>

                          <div style={{ ...styles.entry, background: "#fff", padding: 12, marginBottom: 10 }}>
                            <div style={styles.muted}><strong>Toimitus</strong></div>
                            <div style={styles.muted}>Tapa: {entry.deliveryMethod || "-"}</div>
                            <div style={styles.muted}>Alue: {entry.deliveryArea || "-"}</div>
                            <div style={styles.muted}>Kulu: {entry.deliveryCost !== "" && entry.deliveryCost != null ? `${entry.deliveryCost} €` : "-"}</div>
                            <div style={styles.muted}>Aikaisin toimitus: {entry.earliestDeliveryDate || "-"}</div>
                            <div style={styles.muted}>Kylmäkuljetus: {entry.coldTransport ? "kyllä" : "ei"}</div>
                          </div>

                          {offer.buyer_message ? (
                            <div style={{ ...styles.entry, background: "#fff", padding: 12, marginBottom: 10 }}>
                              <div style={styles.muted}><strong>Ostajan viesti</strong></div>
                              <div>{offer.buyer_message}</div>
                            </div>
                          ) : null}

                          {!revealIdentity ? (
                            <div style={{ ...styles.noticeInfo, marginBottom: 10 }}>
                              Ostajan tiedot avautuvat vasta, kun hyväksyt varauksen tai vastatarjouksen.
                            </div>
                          ) : null}

                          {revealIdentity ? (
                            <div style={{ ...styles.entry, background: "#fff", padding: 12, marginBottom: 10 }}>
                              <div>{offer.buyer_company_name || "-"}</div>
                              {buyerBusinessId ? <div style={styles.muted}>Y-tunnus: {buyerBusinessId}</div> : null}
                              <div style={styles.muted}><strong>Yhteystiedot</strong></div>
                              <div>{offer.buyer_contact_name || "-"}</div>
                              <div>{offer.buyer_email || "-"}{offer.buyer_phone ? ` · ${offer.buyer_phone}` : ""}</div>
                              {buyerDeliveryAddressText ? (
                                <div style={{ marginTop: 10, fontSize: 18, fontWeight: 800, lineHeight: 1.25, color: "#0f172a" }}>
                                  Voit nyt toimittaa kalaerän osoitteeseen: {buyerDeliveryAddressText}
                                </div>
                              ) : null}
                              {buyerDeliveryAddressText ? (
                                <div style={styles.muted}>
                                  Toimitusosoite: {buyerDeliveryAddressText}
                                </div>
                              ) : null}
                              {buyerBillingAddressText ? (
                                <div style={styles.muted}>
                                  Laskutusosoite: {buyerBillingAddressText}
                                </div>
                              ) : null}
                              {buyerBillingEmail ? <div style={styles.muted}>Laskutussähköposti: {buyerBillingEmail}</div> : null}
                              {buyerBusinessId ? <div style={styles.muted}>Y-tunnus: {buyerBusinessId}</div> : null}
                              <div style={styles.muted}>Toimituksen tila: {fulfillmentStatusLabel(offer.fulfillment_status)}</div>
                            </div>
                          ) : null}

                          {!revealIdentity && canManageBuyerOffer(offer) ? (
                            <div style={styles.row}>
                              {!isBuyerOfferAccepted(offer.status) ? <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => onUpdateBuyerOfferStatus(offer, "accepted")}>{getBuyerOfferAcceptanceActionLabel(offer.status)}</button> : null}
                              {!isBuyerOfferRejected(offer.status) ? <button style={styles.button} onClick={() => onUpdateBuyerOfferStatus(offer, "rejected")}>Hylkää</button> : null}
                            </div>
                          ) : null}
                          {revealIdentity && canManageBuyerOffer(offer) ? (
                            <div style={{ ...styles.stack, marginTop: 10 }}>
                              {isAccepted ? (
                                <div style={{ ...styles.entry, background: "#eff6ff", padding: 12 }}>
                                  <strong>Luo lähetyslista</strong>
                                  <div style={styles.small}>Valitse tulostuskoko. A4 sisältää täydet jäljitettävyystiedot, MUNBYN-koot sopivat lämpötulostimelle.</div>
                                  <div style={styles.row}>
                                    <button type="button" style={{ ...styles.button, ...styles.primaryButton }} onClick={() => onCreateDeliveryNote(offer, entry, "a4")}>A4</button>
                                    <button type="button" style={styles.button} onClick={() => onCreateDeliveryNote(offer, entry, "munbyn_4x3")}>MUNBYN 4×3</button>
                                    <button type="button" style={styles.button} onClick={() => onCreateDeliveryNote(offer, entry, "munbyn_4x6")}>MUNBYN 4×6</button>
                                  </div>
                                </div>
                              ) : null}
                              <div style={styles.row}>
                                {offer.fulfillment_status !== "delivery_agreed" ? <button style={styles.button} onClick={() => updateFulfillmentStatus(offer, "delivery_agreed")}>Merkitse toimitus sovituksi</button> : null}
                                {offer.fulfillment_status !== "delivered" ? <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => updateFulfillmentStatus(offer, "delivered")}>Merkitse toimitetuksi</button> : null}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                )}

                {reservation?.status === "accepted" ? null : (
                  <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack, marginTop: 8 }}>
                    <strong></strong>
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
