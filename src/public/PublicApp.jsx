import React from "react";
import PublicBatchView from "../components/PublicBatchView.jsx";

export default function PublicApp({ batchView = null }) {
  if (batchView?.batchId) {
    return (
      <PublicBatchView
        batchId={batchView.batchId}
        data={batchView.data}
        loading={batchView.loading}
        error={batchView.error}
        onLeave={batchView.onLeave}
      />
    );
  }

  return null;
}
