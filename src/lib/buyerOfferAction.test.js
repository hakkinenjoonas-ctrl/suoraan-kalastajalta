import { describe, expect, it } from "vitest";

import {
  buildBuyerOfferActionUpdate,
  canBuyerAccessOffer,
  canManageFulfillment,
} from "../../supabase/functions/_shared/buyerOfferAction.js";

describe("buyerOfferAction", () => {
  it("builds reserve patch only for open offers", () => {
    expect(buildBuyerOfferActionUpdate("reserve", { status: "sent", total_kilos: 12 })).toEqual({
      status: "reserved",
      reserved_kilos: 12,
      buyer_message: null,
    });
    expect(() => buildBuyerOfferActionUpdate("reserve", { status: "accepted", total_kilos: 12 })).toThrow();
  });

  it("builds fulfillment patch only for accepted trades", () => {
    expect(buildBuyerOfferActionUpdate("update_fulfillment", { status: "accepted" }, { fulfillmentStatus: "delivered" })).toEqual({
      fulfillment_status: "delivered",
    });
    expect(() => buildBuyerOfferActionUpdate("update_fulfillment", { status: "reserved" }, { fulfillmentStatus: "delivered" })).toThrow();
  });

  it("allows buyer to mark invoiced trade paid", () => {
    const patch = buildBuyerOfferActionUpdate("mark_paid", { billing_status: "invoiced", billed_at: "2026-05-30T10:00:00.000Z" });
    expect(patch.billing_status).toBe("paid");
    expect(patch.billed_at).toBe("2026-05-30T10:00:00.000Z");
    expect(typeof patch.paid_at).toBe("string");
    expect(() => buildBuyerOfferActionUpdate("mark_paid", { billing_status: "unbilled" })).toThrow();
  });

  it("checks buyer and fulfillment access safely", () => {
    const offer = { buyer_id: "buyer-1", buyer_email: "buyer@example.com", seller_user_id: "seller-1" };
    const buyer = { id: "buyer-1" };
    const buyerProfile = { id: "profile-1", email: "buyer@example.com", role: "buyer" };
    const sellerProfile = { id: "seller-1", email: "seller@example.com", role: "member" };

    expect(canBuyerAccessOffer(offer, buyer, buyerProfile)).toBe(true);
    expect(canManageFulfillment(offer, sellerProfile, buyer)).toBe(true);
  });

  it("allows buyer access via linked buyer record email when offer is not linked by buyer_id", () => {
    const offer = { buyer_id: null, buyer_email: "orders@buyer.example" };
    const buyer = { id: "buyer-1", email: "orders@buyer.example" };
    const buyerProfile = { id: "profile-1", email: "login@buyer.example", role: "buyer" };

    expect(canBuyerAccessOffer(offer, buyer, buyerProfile)).toBe(true);
  });

  it("uses the buyer id linked to the authenticated profile for old offers", () => {
    const offer = { buyer_id: "linked-buyer", buyer_email: "old-address@example.com" };
    const duplicateEmailBuyer = { id: "different-buyer", email: "login@example.com" };
    const buyerProfile = { id: "profile-1", buyer_id: "linked-buyer", email: "login@example.com", role: "buyer" };

    expect(canBuyerAccessOffer(offer, duplicateEmailBuyer, buyerProfile)).toBe(true);
  });

  it("does not grant access merely because the profile has the buyer role", () => {
    const offer = { buyer_id: "another-buyer", buyer_email: "another@example.com" };
    const buyer = { id: "buyer-1", email: "buyer@example.com" };
    const buyerProfile = { id: "profile-1", buyer_id: "buyer-1", email: "buyer@example.com", role: "buyer" };

    expect(canBuyerAccessOffer(offer, buyer, buyerProfile)).toBe(false);
  });
});
