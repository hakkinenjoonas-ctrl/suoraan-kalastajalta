import React from "react";
import {
  buildRoleOptionLabel,
  roleLabel,
  styles,
} from "../lib/ui.js";

export function RoleSelectionView({ roleOptions, buyers, onSelectRole }) {
  return (
    <div style={styles.app}>
      <div style={{ ...styles.container, maxWidth: 560 }}>
        <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
          <h1 style={styles.title}>Valitse rooli</h1>
          <div style={styles.muted}>Tällä sähköpostilla on useita rooleja. Valitse millä roolilla haluat jatkaa.</div>
          <div style={{ ...styles.stack, marginTop: 8 }}>
            {roleOptions.map((option) => (
              <button
                key={option.id}
                style={{ ...styles.button, ...styles.primaryButton, justifyContent: "space-between", width: "100%" }}
                onClick={() => onSelectRole(option)}
              >
                <span>{buildRoleOptionLabel(option, buyers)}</span>
                <span>{option.display_name || option.email}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PendingApprovalView({ profile, onLogout, onDeleteAccount, accountDeletionBusy, showDeleteAccount }) {
  return (
    <div style={styles.app}>
      <div style={{ ...styles.container, maxWidth: 560 }}>
        <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
          <h1 style={styles.title}>Odottaa hyväksyntää</h1>
          <div style={styles.muted}>
            Tunnus on luotu sähköpostille <strong>{profile?.email || "-"}</strong>, mutta valittu rooli tarvitsee vielä ylläpitäjän hyväksynnän ennen kuin tämä näkymä aukeaa kokonaan.
          </div>
          <div style={styles.noticeInfo}>
            Valittu rooli: <strong>{roleLabel(profile?.role || "member")}</strong>
          </div>
          <div style={{ ...styles.row, justifyContent: "flex-end" }}>
            <button style={styles.button} onClick={onLogout}>Kirjaudu ulos</button>
          </div>
          {showDeleteAccount ? (
            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack, background: "#fff1f2", borderColor: "#fecaca" }}>
              <strong style={{ color: "#991b1b" }}>Poista käyttäjätili</strong>
              <div style={styles.muted}>Poisto on pysyvä. Tili ja siihen liittyvät henkilötiedot poistetaan tai lakisääteisesti säilytettävät kauppatiedot anonymisoidaan.</div>
              <div style={{ ...styles.row, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  style={{ ...styles.button, borderColor: "#fca5a5", color: "#b91c1c", background: "#fff" }}
                  onClick={onDeleteAccount}
                  disabled={accountDeletionBusy}
                >
                  {accountDeletionBusy ? "Poistetaan…" : "Poista käyttäjätili"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function AccountDeletionCard({ onDeleteAccount, busy }) {
  return (
    <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack, background: "#fff1f2", borderColor: "#fecaca" }}>
      <strong style={{ color: "#991b1b" }}>Poista käyttäjätili</strong>
      <div style={styles.muted}>
        Poisto on pysyvä. Profiili ja käyttäjän omat tiedot poistetaan. Lakisääteisesti säilytettävät kauppatiedot voidaan säilyttää anonymisoituina.
      </div>
      <div style={styles.muted}>
        Käyttäjätilin poistaminen ei lopeta mahdollista App Store -tilausta. Tilaus lopetetaan erikseen Applen tilausten hallinnasta.
      </div>
      <div style={{ ...styles.row, justifyContent: "flex-end" }}>
        <button
          type="button"
          style={{ ...styles.button, borderColor: "#fca5a5", color: "#b91c1c", background: "#fff" }}
          onClick={onDeleteAccount}
          disabled={busy}
        >
          {busy ? "Poistetaan…" : "Poista käyttäjätili"}
        </button>
      </div>
    </div>
  );
}
