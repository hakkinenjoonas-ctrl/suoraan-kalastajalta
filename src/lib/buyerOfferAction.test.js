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

  it("checks buyer and fulfillment access safely", () => {
    const offer = { buyer_id: "buyer-1", buyer_email: "buyer@example.com", seller_user_id: "seller-1" };
    const buyer = { id: "buyer-1" };
    const buyerProfile = { id: "profile-1", email: "buyer@example.com", role: "buyer" };
    const sellerProfile = { id: "seller-1", email: "seller@example.com", role: "member" };

    expect(canBuyerAccessOffer(offer, buyer, buyerProfile)).toBe(true);
    expect(canManageFulfillment(offer, sellerProfile, buyer)).toBe(true);
  });
});
