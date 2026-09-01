import { describe, expect, it } from "vitest";
import {
  getNotificationRouteTarget,
  normalizeNotificationNavigationPayload,
  parseNotificationPayloadPart,
} from "./notificationRouting.js";

describe("notification routing", () => {
  it("parses object and JSON payload parts without throwing on invalid input", () => {
    expect(parseNotificationPayloadPart({ route: "offers" })).toEqual({ route: "offers" });
    expect(parseNotificationPayloadPart('{"route":"auctions"}')).toEqual({ route: "auctions" });
    expect(parseNotificationPayloadPart("not-json")).toEqual({});
    expect(parseNotificationPayloadPart(null)).toEqual({});
  });

  it("merges nested data and extra payloads in the same order as the app", () => {
    expect(normalizeNotificationNavigationPayload({
      route: "dashboard",
      data: '{"route":"offers","offerId":"offer-1"}',
      extra: { route: "auctions", batchId: "batch-1" },
    })).toMatchObject({
      route: "auctions",
      offerId: "offer-1",
      batchId: "batch-1",
    });
  });

  it("routes billing notifications according to the active role", () => {
    expect(getNotificationRouteTarget({ route: "billing" }, "buyer")).toBe("buyer_billing");
    expect(getNotificationRouteTarget({ route: "billing" }, "member")).toBe("billing");
  });

  it("routes offers and auctions from explicit and legacy payloads", () => {
    expect(getNotificationRouteTarget({ route: "offers" }, "buyer")).toBe("offers");
    expect(getNotificationRouteTarget({ event_type: "auction_bid" })).toBe("auctions");
    expect(getNotificationRouteTarget({ body: "Huutokauppa on päättynyt" })).toBe("auctions");
    expect(getNotificationRouteTarget({ data: '{"route":"auctions"}' })).toBe("auctions");
  });

  it("falls back to the dashboard for unknown notifications", () => {
    expect(getNotificationRouteTarget({ eventType: "general" }, "buyer")).toBe("dashboard");
  });
});
