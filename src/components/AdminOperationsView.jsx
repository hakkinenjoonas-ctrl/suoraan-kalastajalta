import React, { useMemo } from "react";
import { styles } from "../lib/ui.js";
import { buildAdminOperationsSnapshot } from "../lib/adminInsights.js";

function formatDateTime(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("fi-FI", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(value);
  }
}

function getIssueStyle(severity) {
  if (severity === "warning") {
    return {
      background: "#fff7ed",
      borderColor: "#fdba74",
    };
  }
  return {
    background: "#f8fbff",
    borderColor: "#bfdbfe",
  };
}

function getActivityStyle(kind) {
  if (kind === "offer_created") return { background: "#eff6ff", borderColor: "#93c5fd" };
  if (kind === "offer_updated") return { background: "#f8fbff", borderColor: "#bfdbfe" };
  if (kind === "offer_billed" || kind === "offer_paid") return { background: "#ecfdf5", borderColor: "#86efac" };
  if (kind === "push_seen") return { background: "#fff7ed", borderColor: "#fdba74" };
  return { background: "#f8fafc", borderColor: "#cbd5e1" };
}

export default function AdminOperationsView({
  entries,
  processedEntries,
  buyerOffers,
  buyers,
  ownerUserProfiles,
  appPushTokens,
}) {
  const snapshot = useMemo(() => buildAdminOperationsSnapshot({
    entries,
    processedEntries,
    buyerOffers,
    buyers,
    ownerUserProfiles,
    appPushTokens,
  }), [entries, processedEntries, buyerOffers, buyers, ownerUserProfiles, appPushTokens]);

  return (
    <div style={{ ...styles.stack, gap: 18 }}>
      <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
        <strong>Ylläpito ja tilannekuva</strong>
        <div style={styles.noticeInfo}>
          Tässä näkymässä näkyvät tuotantokäytön tärkeimmät havainnot: jumissa olevat tarjoukset, lähetetyt laskut,
          ristiriitaiset tilat ja viimeisin aktiviteetti.{"\n"}
          Jos Supabase-lokissa näkyy `send-push-notification:skipped-no-tokens`, se tarkoittaa yleensä että ostajalta puuttuu
          aktiivinen puhelimen push-token, ei sitä että tarjous olisi mennyt rikki.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 18 }}>
          <div style={{ ...styles.card, ...styles.sectionCard }}>
            <div style={styles.metric}>{snapshot.metrics.stuckOffers}</div>
            <div style={styles.muted}>jumissa olevaa tarjousta</div>
          </div>
          <div style={{ ...styles.card, ...styles.sectionCard }}>
            <div style={styles.metric}>{snapshot.metrics.invoicedCount}</div>
            <div style={styles.muted}>lähetettyä laskua</div>
          </div>
          <div style={{ ...styles.card, ...styles.sectionCard }}>
            <div style={styles.metric}>{snapshot.metrics.missingPushBuyers}</div>
            <div style={styles.muted}>ostajaa ilman push-tokenia</div>
          </div>
          <div style={{ ...styles.card, ...styles.sectionCard }}>
            <div style={styles.metric}>{snapshot.metrics.inconsistentStates}</div>
            <div style={styles.muted}>ristiriitaista tilaa</div>
          </div>
          <div style={{ ...styles.card, ...styles.sectionCard }}>
            <div style={styles.metric}>{snapshot.metrics.recentOffers}</div>
            <div style={styles.muted}>tarjousta tapahtumavirrassa</div>
          </div>
          <div style={{ ...styles.card, ...styles.sectionCard }}>
            <div style={styles.metric}>{snapshot.metrics.activePushTokens}</div>
            <div style={styles.muted}>aktiivista push-laitetta</div>
          </div>
        </div>
      </div>

      <div style={{ ...styles.grid2, alignItems: "start" }}>
        <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
          <strong>Viimeisimmät tarjoukset</strong>
          <div style={styles.muted}>Tässä näkyvät uusimmat tarjousrivit nykyisellä tilallaan, jotta owner näkee nopeasti mitä markkinassa tapahtuu.</div>
          {snapshot.recentOffers.length === 0 ? (
            <div style={styles.muted}>Ei vielä tarjoushistoriaa.</div>
          ) : (
            snapshot.recentOffers.slice(0, 16).map((item) => (
              <div key={item.id} style={{ ...styles.entry, background: "#f8fafc" }}>
                <div style={styles.entryBadges}>
                  <span style={styles.badge}>{item.statusLabel}</span>
                  <span style={styles.badge}>{item.quantityLabel}</span>
                  {item.deliveryCity ? <span style={styles.badge}>{item.deliveryCity}</span> : null}
                  <span style={styles.badge}>{item.billingStatus === "paid" ? "Maksettu" : item.billingStatus === "invoiced" ? "Laskutettu" : "Laskuttamaton"}</span>
                </div>
                <div style={styles.muted}><strong>{item.speciesHeadline}</strong> · {item.buyerLabel}</div>
                <div style={styles.muted}>Kalastaja: {item.sellerName}{item.buyerEmail ? ` · ${item.buyerEmail}` : ""}</div>
                <div style={styles.small}>{formatDateTime(item.timestamp)}</div>
              </div>
            ))
          )}
        </div>

        <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
          <strong>Ostajakohtainen tilanne</strong>
          <div style={styles.muted}>Näet yhdellä silmäyksellä paljonko kullakin ostajalla on avoimia, hyväksyttyjä ja laskutettuja tarjouksia sekä onko push-valmius kunnossa.</div>
          {snapshot.buyerOverview.length === 0 ? (
            <div style={styles.muted}>Ei vielä ostajakohtaista tapahtumadataa.</div>
          ) : (
            snapshot.buyerOverview.slice(0, 16).map((item) => (
              <div key={item.buyerId} style={{ ...styles.entry, background: "#f8fbff" }}>
                <div style={styles.entryBadges}>
                  <span style={styles.badge}>{item.totalOffers} tarjousta</span>
                  <span style={styles.badge}>{item.openOffers} avointa</span>
                  <span style={styles.badge}>{item.acceptedOffers} hyväksyttyä</span>
                  <span style={styles.badge}>{item.invoicedOffers} laskutettua</span>
                  <span style={{ ...styles.badge, ...(item.hasActivePushToken ? { background: "#ecfdf5", borderColor: "#86efac", color: "#166534" } : { background: "#fff7ed", borderColor: "#fdba74", color: "#b45309" }) }}>
                    {item.hasActivePushToken ? "Push valmis" : "Push puuttuu"}
                  </span>
                </div>
                <div style={styles.muted}><strong>{item.buyerLabel}</strong>{item.buyerEmail ? ` · ${item.buyerEmail}` : ""}</div>
                <div style={styles.small}>Viimeisin tapahtuma: {formatDateTime(item.latestTimestamp)}</div>
              </div>
            ))
          )}
        </div>
      </div>

      <div style={{ ...styles.grid2, alignItems: "start" }}>
        <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
          <strong>Jumissa olevat tarjoukset</strong>
          {snapshot.stuckOffers.length === 0 ? (
            <div style={styles.muted}>Ei tällä hetkellä jumissa olevia tarjouksia.</div>
          ) : (
            snapshot.stuckOffers.slice(0, 12).map((item) => (
              <div key={item.id} style={{ ...styles.entry, ...getIssueStyle(item.severity) }}>
                <div style={styles.entryBadges}>
                  <span style={styles.badge}>{item.statusLabel}</span>
                  <span style={styles.badge}>{item.ageLabel}</span>
                </div>
                <div style={styles.muted}><strong>{item.speciesHeadline}</strong> · {item.buyerLabel}</div>
                <div style={styles.muted}>{item.detail}</div>
                <div style={styles.small}>{formatDateTime(item.timestamp)}</div>
              </div>
            ))
          )}
        </div>

        <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
          <strong>Push puuttuu ostajalta</strong>
          {snapshot.missingPushBuyers.length === 0 ? (
            <div style={styles.muted}>Kaikilla avoimia tarjouksia saaneilla ostajilla on aktiivinen push-token.</div>
          ) : (
            snapshot.missingPushBuyers.slice(0, 12).map((item) => (
              <div key={item.buyerId} style={{ ...styles.entry, background: "#fff7ed", borderColor: "#fdba74" }}>
                <div style={styles.entryBadges}>
                  <span style={styles.badge}>{item.offerCount} tarjousta</span>
                  <span style={styles.badge}>Push puuttuu</span>
                </div>
                <div style={styles.muted}><strong>{item.buyerLabel}</strong>{item.buyerEmail ? ` · ${item.buyerEmail}` : ""}</div>
                <div style={styles.muted}>Supabase-loki voi näyttää tästä `skipped-no-tokens`, kun tarjous yritetään lähettää puhelimeen.</div>
                <div style={styles.small}>Viimeisin avoin tarjous: {formatDateTime(item.latestTimestamp)}</div>
              </div>
            ))
          )}
        </div>
      </div>

      <div style={{ ...styles.grid2, alignItems: "start" }}>
        <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
          <strong>Laskutusseuranta</strong>
          {snapshot.invoiceWatch.length === 0 ? (
            <div style={styles.muted}>Ei vielä laskutettuja tai maksettuja kauppoja.</div>
          ) : (
            snapshot.invoiceWatch.slice(0, 12).map((item) => (
              <div key={item.id} style={{ ...styles.entry, background: "#f8fbff" }}>
                <div style={styles.entryBadges}>
                  <span style={styles.badge}>{item.statusLabel}</span>
                  <span style={styles.badge}>{item.amountKg} kg</span>
                  <span style={styles.badge}>{Number(item.pricePerKg || 0).toLocaleString("fi-FI")} € / kg ALV 0 %</span>
                </div>
                <div style={styles.muted}><strong>{item.speciesHeadline}</strong> · {item.buyerLabel}</div>
                <div style={styles.small}>{formatDateTime(item.timestamp)}</div>
              </div>
            ))
          )}
        </div>

        <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
          <strong>Tapahtumavirta</strong>
          <div style={styles.muted}>Tämä kokoaa ownerille mahdollisimman laajasti näkyviin, mitä appissa on tapahtunut viime aikoina.</div>
          {snapshot.recentActivity.length === 0 ? (
            <div style={styles.muted}>Ei vielä viimeaikaisia tapahtumia.</div>
          ) : (
            snapshot.recentActivity.slice(0, 24).map((item) => (
              <div key={item.key} style={{ ...styles.entry, ...getActivityStyle(item.kind) }}>
                <div style={styles.muted}><strong>{item.title}</strong></div>
                <div style={styles.muted}>{item.detail}</div>
                <div style={styles.small}>{formatDateTime(item.timestamp)}</div>
              </div>
            ))
          )}
        </div>
      </div>

      <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
        <strong>Aktiiviset push-laitteet</strong>
        <div style={styles.muted}>Tässä näkyvät kaikki tällä hetkellä aktiiviset push-tokenit, jotta owner voi nopeasti huomata väärät roolit tai puuttuvat ostajalinkitykset.</div>
        {snapshot.pushTokenInventory.length === 0 ? (
          <div style={styles.muted}>Ei aktiivisia push-laitteita.</div>
        ) : (
          snapshot.pushTokenInventory.slice(0, 20).map((item) => (
            <div key={item.id} style={{ ...styles.entry, background: "#fff" }}>
              <div style={styles.entryBadges}>
                <span style={styles.badge}>{item.platform || "laite"}</span>
                <span style={styles.badge}>{item.role || "-"}</span>
                <span style={{ ...styles.badge, ...(item.hasBuyerLink ? { background: "#ecfdf5", borderColor: "#86efac", color: "#166534" } : { background: "#fff7ed", borderColor: "#fdba74", color: "#b45309" }) }}>
                  {item.hasBuyerLink ? "Ostajalinkki ok" : "Buyer-linkki puuttuu"}
                </span>
              </div>
              <div style={styles.muted}><strong>{item.actorLabel}</strong>{item.buyerLabel ? ` · ${item.buyerLabel}` : ""}</div>
              <div style={styles.muted}>{item.deviceLabel || "-"}</div>
              <div style={styles.small}>Viimeksi nähty: {formatDateTime(item.lastSeenAt)}</div>
            </div>
          ))
        )}
      </div>

      <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
        <strong>Ristiriidat ja tarkistettavat tilat</strong>
        {snapshot.inconsistentStates.length === 0 ? (
          <div style={styles.muted}>Ei havaittuja ristiriitaisia tiloja.</div>
        ) : (
          snapshot.inconsistentStates.slice(0, 20).map((item, index) => (
            <div key={`${item.offerId}-${index}`} style={{ ...styles.entry, ...getIssueStyle(item.severity) }}>
              <div style={styles.muted}><strong>{item.speciesHeadline}</strong> · {item.buyerLabel}</div>
              <div style={styles.muted}>{item.detail}</div>
              <div style={styles.small}>{formatDateTime(item.timestamp)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
