import { describe, expect, it } from "vitest";
import { buildAdminOperationsSnapshot } from "./adminInsights.js";

describe("buildAdminOperationsSnapshot", () => {
  it("flags buyers with open offers but no active push tokens", () => {
    const snapshot = buildAdminOperationsSnapshot({
      buyers: [{ id: "buyer-1", company_name: "Ostaja Oy" }],
      buyerOffers: [{
        id: "offer-1",
        buyer_id: "buyer-1",
        buyer_email: "ostaja@example.com",
        status: "sent",
        billing_status: "unbilled",
        species_summary: "Kuha: 40 kg",
        created_at: "2026-05-01T08:00:00.000Z",
        updated_at: "2026-05-01T08:00:00.000Z",
      }],
      appPushTokens: [],
    });

    expect(snapshot.missingPushBuyers).toHaveLength(1);
    expect(snapshot.missingPushBuyers[0]).toMatchObject({
      buyerId: "buyer-1",
      buyerLabel: "Ostaja Oy",
      offerCount: 1,
    });
    expect(snapshot.inconsistentStates.some((issue) => issue.detail.includes("push-token"))).toBe(true);
  });

  it("flags billing timeline inconsistencies", () => {
    const snapshot = buildAdminOperationsSnapshot({
      buyers: [{ id: "buyer-2", company_name: "Kala Kauppa" }],
      buyerOffers: [{
        id: "offer-2",
        buyer_id: "buyer-2",
        status: "accepted",
        billing_status: "paid",
        species_summary: "Ahven: 12 kg",
        created_at: "2026-05-01T08:00:00.000Z",
        updated_at: "2026-05-01T09:00:00.000Z",
        paid_at: "",
        billed_at: "",
      }],
      appPushTokens: [{ id: "token-1", buyer_id: "buyer-2", is_active: true }],
    });

    expect(snapshot.inconsistentStates.some((issue) => issue.detail.includes("paid_at puuttuu"))).toBe(true);
    expect(snapshot.inconsistentStates.some((issue) => issue.detail.includes("maksetuksi ilman laskutetuksi"))).toBe(true);
  });

  it("builds recent activity from entries and billing events", () => {
    const snapshot = buildAdminOperationsSnapshot({
      buyers: [{ id: "buyer-3", company_name: "Ravintola Testi" }],
      buyerOffers: [{
        id: "offer-3",
        buyer_id: "buyer-3",
        status: "accepted",
        billing_status: "invoiced",
        species_summary: "Muikku: 20 kg",
        created_at: "2026-05-01T08:00:00.000Z",
        updated_at: "2026-05-01T10:00:00.000Z",
        billed_at: "2026-05-01T11:00:00.000Z",
      }],
      entries: [{
        id: "entry-1",
        ownerName: "Kalastaja Kalle",
        species: "Muikku",
        kilos: 20,
        createdAt: "2026-05-01T07:00:00.000Z",
      }],
    });

    expect(snapshot.recentActivity[0].title).toBe("Lasku merkitty lähetetyksi");
    expect(snapshot.recentActivity.some((event) => event.title === "Saalis tallennettu")).toBe(true);
  });
});
