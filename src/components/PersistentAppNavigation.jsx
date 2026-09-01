import React from "react";

export default function PersistentAppNavigation({ onHome, viewportWidth, hidden = false }) {
  if (hidden) return null;
  const compact = viewportWidth < 560;
  return (
    <button
      type="button"
      onClick={onHome}
      aria-label="Siirry aloitusnäkymään"
      style={{
        position: "fixed",
        left: "max(12px, env(safe-area-inset-left))",
        bottom: "max(14px, env(safe-area-inset-bottom))",
        zIndex: 2800,
        minWidth: compact ? 126 : 142,
        minHeight: 52,
        padding: "12px 18px",
        border: "1px solid #1d4ed8",
        borderRadius: 999,
        background: "linear-gradient(135deg, #2563eb, #0ea5e9)",
        color: "#ffffff",
        fontSize: compact ? 16 : 17,
        fontWeight: 900,
        cursor: "pointer",
        boxShadow: "0 14px 30px rgba(37, 99, 235, 0.34)",
      }}
    >
      ⌂ Aloitus
    </button>
  );
}
