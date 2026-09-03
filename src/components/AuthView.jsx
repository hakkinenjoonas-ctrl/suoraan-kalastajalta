import React from "react";
import { styles } from "../lib/ui.js";

const LEGAL_TERMS_URL = "https://www.suoraankalastajalta.fi/tietosuojaseloste-ja-k%C3%A4ytt%C3%B6ehdot";

function isNativeIosApp() {
  if (typeof window === "undefined") return false;
  const maybeCapacitor = window.Capacitor;
  return typeof maybeCapacitor?.getPlatform === "function"
    && maybeCapacitor.getPlatform() === "ios";
}
function getHeaderBrandStyles(viewportWidth) {
  const compact = viewportWidth < 560;
  return {
    row: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: compact ? 12 : 2,
      flexWrap: "nowrap",
      width: "100%",
      marginTop: compact ? 0 : 12,
      marginBottom: compact ? 8 : 12,
      minWidth: 0,
    },
    title: {
      ...styles.title,
      marginRight: compact ? 0 : -2,
      minWidth: 0,
      flex: "1 1 auto",
      width: "auto",
      fontSize: compact ? "clamp(27px, 8vw, 34px)" : styles.title.fontSize,
      lineHeight: compact ? 1.02 : styles.title.lineHeight,
    },
    logo: {
      height: compact ? "auto" : viewportWidth < 768 ? 116 : viewportWidth < 1024 ? 170 : 196,
      width: compact ? 86 : "auto",
      maxWidth: compact ? 86 : viewportWidth < 768 ? "36vw" : "none",
      objectFit: "contain",
      display: "block",
      flex: "0 0 auto",
    },
  };
}

export default function AuthView({ authMode, setAuthMode, authForm, setAuthForm, onSignIn, onSignUp, onForgotPassword, onResetRecoveredPassword, authError, authInfo, authSubmitting, viewportWidth }) {
  const headerBrandStyles = getHeaderBrandStyles(viewportWidth);
  const isMobile = viewportWidth < 560;
  const isIosMobileApp = isMobile && isNativeIosApp();
  const authCardStyle = isMobile
    ? { borderRadius: 20, boxShadow: "0 14px 34px rgba(30, 64, 175, 0.08)" }
    : null;
  const authInputStyle = isMobile
    ? { ...styles.input, minHeight: 48, padding: "11px 14px", borderRadius: 14, fontSize: 16 }
    : styles.input;
  const authButtonStyle = isMobile
    ? { ...styles.button, minHeight: 48, padding: "10px 14px", borderRadius: 14 }
    : styles.button;

  return (
    <div style={{ ...styles.app, ...(isMobile ? { padding: `${isIosMobileApp ? 64 : 12}px 12px 24px`, minHeight: "100dvh" } : {}) }}>
      <div style={{ ...styles.container, maxWidth: 520 }}>
        <div style={{ ...styles.card, ...styles.headerCard, ...authCardStyle, marginBottom: isMobile ? 12 : 16, padding: isMobile ? "18px 18px 16px" : styles.headerCard.padding }}>
          <div style={headerBrandStyles.row}>
            <h1 style={headerBrandStyles.title}>Suoraan Kalastajalta</h1>
            <img
              src="/logo.png"
              alt=""
              style={{
                ...headerBrandStyles.logo,
                ...(isMobile
                  ? { width: "clamp(104px, 28vw, 124px)", maxWidth: "clamp(104px, 28vw, 124px)" }
                  : {}),
              }}
            />
          </div>
          <p style={{ ...styles.subtitle, ...(isMobile ? { marginTop: 4, fontSize: 15 } : {}) }}>
            {authMode === "signup"
              ? "Luo tunnus kalastajalle tai ostajalle."
              : authMode === "recovery"
              ? "Aseta uusi salasana turvallisesti."
              : "Kirjaudu sisään jatkaaksesi sovellukseen."}
          </p>
        </div>
        <form
          style={{ ...styles.card, ...styles.sectionCard, ...styles.stack, ...authCardStyle, ...(isMobile ? { padding: 16, gap: 12 } : {}) }}
          onSubmit={(e) => {
            e.preventDefault();
            if (authMode === "signin") {
              onSignIn();
            } else if (authMode === "recovery") {
              onResetRecoveredPassword();
            } else {
              onSignUp();
            }
          }}
        >
          {authMode !== "recovery" ? (
            <div style={{ ...styles.tabs6, gridTemplateColumns: "1fr 1fr", marginBottom: 0, ...(isMobile ? { padding: 5, gap: 4, borderRadius: 16 } : {}) }}>
              <button type="button" style={{ ...styles.tab, ...(isMobile ? { padding: "11px 8px", borderRadius: 12 } : {}), ...(authMode === "signin" ? styles.activeTab : {}) }} onClick={() => setAuthMode("signin")}>Kirjaudu</button>
              <button type="button" style={{ ...styles.tab, ...(isMobile ? { padding: "11px 8px", borderRadius: 12 } : {}), ...(authMode === "signup" ? styles.activeTab : {}) }} onClick={() => setAuthMode("signup")}>Rekisteröidy</button>
            </div>
          ) : (
            <div style={{ ...styles.card, padding: "12px 16px", background: "#eff6ff", border: "1px solid #93c5fd" }}>
              <strong>Aseta uusi salasana</strong>
              <div style={styles.muted}>Avaa sähköpostista tullut palautuslinkki ja aseta tähän uusi salasana.</div>
            </div>
          )}

          <div style={styles.field}>
            <label>Sähköposti</label>
            <input style={authInputStyle} type="email" value={authForm.email} onChange={(e) => setAuthForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="esim. nimi@yritys.fi" disabled={authMode === "recovery"} />
          </div>

          <div style={styles.field}>
            <label>{authMode === "recovery" ? "Uusi salasana" : "Salasana"}</label>
            <input style={authInputStyle} type="password" value={authForm.password} onChange={(e) => setAuthForm((prev) => ({ ...prev, password: e.target.value }))} placeholder={authMode === "recovery" ? "vähintään 8 merkkiä" : "salasana"} />
          </div>

          {authMode === "signup" ? (
            <>
              <div style={styles.field}>
                <label>Nimi</label>
                <input style={styles.input} value={authForm.displayName} onChange={(e) => setAuthForm((prev) => ({ ...prev, displayName: e.target.value }))} placeholder="Esim. Kala Yritys Oy" />
              </div>
              <div style={styles.field}>
                <label>Rooli</label>
                <select style={styles.input} value={authForm.requestedRole} onChange={(e) => setAuthForm((prev) => ({ ...prev, requestedRole: e.target.value }))}>
                  <option value="member">Kalastaja</option>
                  <option value="buyer">Ostaja</option>
                  <option value="consumer">Kuluttaja</option>
                </select>
              </div>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, lineHeight: 1.4 }}>
                <input
                  type="checkbox"
                  checked={Boolean(authForm.acceptedTerms)}
                  onChange={(e) => setAuthForm((prev) => ({ ...prev, acceptedTerms: e.target.checked }))}
                  style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0 }}
                />
                <span>
                  Olen lukenut ja hyväksyn palvelun{" "}
                  <a href={LEGAL_TERMS_URL} target="_blank" rel="noreferrer">käyttöehdot ja tietosuojaselosteen</a>.
                </span>
              </label>
            </>
          ) : null}

          {authMode === "recovery" ? (
            <div style={styles.field}>
              <label>Uusi salasana uudelleen</label>
              <input style={styles.input} type="password" value={authForm.confirmPassword} onChange={(e) => setAuthForm((prev) => ({ ...prev, confirmPassword: e.target.value }))} placeholder="kirjoita uusi salasana uudelleen" />
            </div>
          ) : null}

          {authError ? <div style={styles.noticeError}>{authError}</div> : null}
          {authInfo ? <div style={styles.noticeSuccess}>{authInfo}</div> : null}

          {authMode === "signin" ? (
            <>
              <button type="submit" style={{ ...authButtonStyle, ...styles.primaryButton }} disabled={authSubmitting}>
                {authSubmitting ? "Kirjaudutaan..." : "Kirjaudu sisään"}
              </button>
              <button type="button" style={authButtonStyle} onClick={onForgotPassword} disabled={authSubmitting}>Unohditko salasanan?</button>
            </>
          ) : authMode === "recovery" ? (
            <button type="submit" style={{ ...styles.button, ...styles.primaryButton }} disabled={authSubmitting}>
              {authSubmitting ? "Tallennetaan..." : "Tallenna uusi salasana"}
            </button>
          ) : (
            <button type="submit" style={{ ...styles.button, ...styles.primaryButton }} disabled={authSubmitting}>
              {authSubmitting ? "Luodaan..." : "Luo tunnus"}
            </button>
          )}

          {authMode === "signup" ? <div style={styles.muted}>Kuluttaja, ostaja ja kalastaja pääsevät appiin heti rekisteröitymisen jälkeen. Kuluttajapuoli toimii erillään yritysostajien B2B-myynnistä.</div> : null}

        </form>
      </div>
    </div>
  );
}
