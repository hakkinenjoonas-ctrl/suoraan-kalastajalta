import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import ConsumerApp from "./public/ConsumerApp.jsx";
import { isConsumerMarketplaceRequested } from "./lib/consumerMarketplace.js";

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: String(error?.message || error || "Tuntematon virhe"),
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error("App render crashed", error, errorInfo);
  }

  clearOfferParamAndReload = () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("offer");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    } catch (error) {
      console.error("Failed to clean URL after crash", error);
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh",
          padding: "32px 16px",
          background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 50%, #bae6fd 100%)",
          color: "#0f172a",
          fontFamily: "Inter, sans-serif",
        }}>
          <div style={{
            maxWidth: 720,
            margin: "0 auto",
            background: "rgba(255,255,255,0.96)",
            border: "1px solid #bfdbfe",
            borderRadius: 28,
            padding: 28,
            boxShadow: "0 24px 80px rgba(15,23,42,0.14)",
          }}>
            <h1 style={{ margin: "0 0 12px", fontSize: 34, lineHeight: 1.05 }}>
              Sovellus ei saanut avattua tätä näkymää
            </h1>
            <p style={{ margin: "0 0 18px", fontSize: 16, lineHeight: 1.6, color: "#475569" }}>
              Jos tulit tähän sähköpostin tarjouslinkistä, tarjouslinkin data kaatoi näkymän. Voit palata appiin alla olevalla
              painikkeella, ja tarjouslista avautuu ilman rikkonutta linkkiparametria.
            </p>
            <div style={{
              marginBottom: 20,
              padding: 14,
              borderRadius: 16,
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#b91c1c",
              fontSize: 14,
              lineHeight: 1.5,
              wordBreak: "break-word",
            }}>
              Virhe: {this.state.errorMessage}
            </div>
            <button
              type="button"
              onClick={this.clearOfferParamAndReload}
              style={{
                border: "1px solid #2563eb",
                background: "linear-gradient(135deg, #2563eb, #0ea5e9)",
                color: "#ffffff",
                padding: "14px 22px",
                borderRadius: 18,
                fontSize: 16,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Palaa appiin
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppErrorBoundary>
      {isConsumerMarketplaceRequested() ? <ConsumerApp /> : <App />}
    </AppErrorBoundary>
  </React.StrictMode>
);
