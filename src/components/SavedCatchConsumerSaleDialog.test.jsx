import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SavedCatchConsumerSaleDialog from "./SavedCatchConsumerSaleDialog.jsx";

describe("SavedCatchConsumerSaleDialog", () => {
  it("shows a separate consumer-sale flow and the saved catch quantity", () => {
    const html = renderToStaticMarkup(
      <SavedCatchConsumerSaleDialog
        entry={{ id: "catch-1", batchId: "KAL-100", species: "Muikku", kilos: 100, date: "2026-09-08", municipality: "Taipalsaari" }}
        profile={{ id: "seller-1", display_name: "Testikalastaja" }}
        accessToken="test-token"
        defaultPickupLocation="Satamatie 1"
        publicAppBaseUrl="https://example.test"
        onClose={() => {}}
        onPublished={() => {}}
      />,
    );

    expect(html).toContain("Myy suoraan kuluttajalle");
    expect(html).toContain("saalis 100 kg");
    expect(html).toContain("Voit myydä koko saaliin tai vain osan siitä");
    expect(html).toContain("Saaliista jää tämän listauksen ulkopuolelle vähintään 99 kg");
  });
});
