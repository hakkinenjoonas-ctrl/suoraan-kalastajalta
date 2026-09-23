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
        defaultPickupMunicipality="Taipalsaari"
        publicAppBaseUrl="https://example.test"
        onClose={() => {}}
        onPublished={() => {}}
      />,
    );

    expect(html).toContain("Myy suoraan kuluttajalle");
    expect(html).toContain("saalis 100 kg");
    expect(html).toContain("Voit myydä koko saaliin tai vain osan siitä");
    expect(html).toContain("Tarkistetaan saaliserän vapaata määrää");
    expect(html).toContain("Tarkistetaan määrää");
    expect(html).toContain("Noutopaikan paikkakunta");
  });

  it("blocks consumer publishing when the catch already has a business offer", () => {
    const html = renderToStaticMarkup(
      <SavedCatchConsumerSaleDialog
        entry={{ id: "catch-business", batchId: "KAL-200", species: "Kuha", kilos: 20, date: "2026-09-18", offerToShops: true }}
        profile={{ id: "seller-1", display_name: "Testikalastaja" }}
        accessToken="token"
        defaultPickupLocation="Satama"
        defaultPickupMunicipality="Lappeenranta"
        publicAppBaseUrl="https://example.test"
        onClose={() => {}}
        onPublished={() => {}}
      />,
    );

    expect(html).toContain("Kuluttajamyynti estetty");
    expect(html).toContain("disabled");
  });

  it("defaults crayfish to piece-priced size classes", () => {
    const html = renderToStaticMarkup(
      <SavedCatchConsumerSaleDialog
        entry={{ id: "catch-crayfish", batchId: "RAPU-100", species: "Täplärapu 12+ cm", kilos: 9, count: 80, date: "2026-09-17" }}
        profile={{ id: "seller-1", display_name: "Testikalastaja" }}
        accessToken="test-token"
        defaultPickupLocation="Satamatie 1"
        defaultPickupMunicipality="Taipalsaari"
        publicAppBaseUrl="https://example.test"
        onClose={() => {}}
        onPublished={() => {}}
      />,
    );

    expect(html).toContain("saalis 80 kpl");
    expect(html).toContain("Ravut kappaleittain");
    expect(html).toContain("12+ cm");
    expect(html).toContain("Kappalehinta sis. ALV");
    expect(html).toContain("Rapuja myyntiin (kpl)");
  });
});
