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
          <strong>Viimeisin aktiviteetti</strong>
          {snapshot.recentActivity.length === 0 ? (
            <div style={styles.muted}>Ei vielä viimeaikaisia tapahtumia.</div>
          ) : (
            snapshot.recentActivity.slice(0, 16).map((item) => (
              <div key={item.key} style={{ ...styles.entry, background: "#f8fafc" }}>
                <div style={styles.muted}><strong>{item.title}</strong></div>
                <div style={styles.muted}>{item.detail}</div>
                <div style={styles.small}>{formatDateTime(item.timestamp)}</div>
              </div>
            ))
          )}
        </div>
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
