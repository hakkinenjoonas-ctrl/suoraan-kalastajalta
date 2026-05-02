import { describe, expect, it } from "vitest";

import { buildBuyerReport } from "../../supabase/functions/_shared/buyerReport.js";

describe("buildBuyerReport", () => {
  it("includes only accepted purchases and aggregates totals", () => {
    const report = buildBuyerReport([
      {
        id: "offer-1",
        status: "accepted",
        species_summary: "Kuha: 10 kg",
        reserved_kilos: 10,
        counter_price_per_kg: 12.5,
        delivery_cost: 15,
        seller_name: "Kalastaja A",
        area: "Saimaa",
        created_at: "2026-04-01T10:00:00.000Z",
        updated_at: "2026-04-02T12:00:00.000Z",
      },
      {
        id: "offer-2",
        status: "accepted",
        species_summary: "Ahven: 5 kg",
        total_kilos: 5,
        price_per_kg: 8,
        seller_name: "Kalastaja B",
        area: "Saimaa",
        created_at: "2026-04-03T10:00:00.000Z",
        updated_at: "2026-04-03T11:00:00.000Z",
      },
      {
        id: "offer-3",
        status: "sold",
        species_summary: "Made: 3 kg",
        total_kilos: 3,
        price_per_kg: 7,
        seller_name: "Kalastaja C",
        created_at: "2026-04-04T10:00:00.000Z",
      },
    ], {
      id: "buyer-1",
      company_name: "Ravintola Testi",
      email: "osti@example.com",
    });

    expect(report.summary.purchaseCount).toBe(2);
    expect(report.summary.totalQuantityKg).toBe(15);
    expect(report.summary.totalTradeValueEur).toBe(165);
    expect(report.summary.totalDeliveryCostEur).toBe(15);
    expect(report.summary.totalValueEur).toBe(180);
    expect(report.summary.topSpecies.map((row) => row.species)).toEqual(["Kuha", "Ahven"]);
    expect(report.summary.topSellers.map((row) => row.sellerName)).toEqual(["Kalastaja A", "Kalastaja B"]);
    expect(report.purchases).toHaveLength(2);
    expect(report.buyer.companyName).toBe("Ravintola Testi");
  });

  it("uses explicit trade value when it exists", () => {
    const report = buildBuyerReport([
      {
        id: "offer-1",
        status: "accepted",
        species_summary: "Muikku: 20 kg",
        total_kilos: 20,
        price_per_kg: 4,
        trade_value: 95,
        seller_name: "Kalastaja A",
        created_at: "2026-03-01T10:00:00.000Z",
        updated_at: "2026-03-01T10:00:00.000Z",
      },
    ]);

    expect(report.summary.totalTradeValueEur).toBe(95);
    expect(report.purchases[0].tradeValueEur).toBe(95);
  });

  it("preserves mixed-offer pricing fields for species-level buyer reporting", () => {
    const report = buildBuyerReport([
      {
        id: "offer-4",
        status: "accepted",
        species_summary: "Siika: 120 kg · Hinta 9 €/kg\nAhven: 30 kg · Hinta 8 €/kg",
        buyer_message: "Hyväksytty vastatarjous:\n- Siika: 7 €/kg\n- Ahven: 5 €/kg",
        total_kilos: 150,
        seller_name: "Kalastaja D",
        created_at: "2026-04-30T10:00:00.000Z",
        updated_at: "2026-04-30T10:00:00.000Z",
      },
    ]);

    expect(report.purchases[0].buyerMessage).toContain("- Ahven: 5 €/kg");
    expect(report.purchases[0].speciesSummary).toContain("Ahven: 30 kg");
    expect(report.purchases[0].totalKilos).toBe(150);
  });
});
