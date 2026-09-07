import { describe, expect, it } from "vitest";
import {
  formatConsumerPaymentMethods,
  calculateConsumerOrderTotals,
  calculateConsumerReservationBasket,
  calculateConsumerReservationEstimate,
  filterConsumerListings,
  getConsumerListingPath,
  getRequestedConsumerListingId,
  isConsumerDemoRequested,
  isConsumerListingPickupEnded,
  isConsumerMarketplaceRequested,
  normalizeConsumerListing,
  normalizeConsumerPaymentMethods,
} from "./consumerMarketplace.js";

describe("consumer marketplace", () => {
  it("detects the isolated B2C route", () => {
    expect(isConsumerMarketplaceRequested({ search: "?market=consumer" })).toBe(true);
    expect(isConsumerMarketplaceRequested({ search: "?batch=ABC" })).toBe(false);
    expect(isConsumerDemoRequested({ search: "?market=consumer&demo=1" })).toBe(true);
    expect(isConsumerMarketplaceRequested({ pathname: "/kuluttaja/era/listing-1", search: "" })).toBe(true);
    expect(getRequestedConsumerListingId({ pathname: "/kuluttaja/era/listing%201", search: "" })).toBe("listing 1");
    expect(getConsumerListingPath("listing 1")).toBe("/kuluttaja/era/listing%201");
  });

  it("calculates VAT and seller commission from a consumer price", () => {
    expect(calculateConsumerOrderTotals({ packagePrice: 11.35, packageCount: 2 })).toEqual({
      grossTotal: 22.7,
      netTotal: 20,
      vatAmount: 2.7,
      commissionAmount: 1.6,
    });
  });

  it("normalizes and filters only available published listings", () => {
    const listings = [
      normalizeConsumerListing({ id: 1, species: "Kuha", municipality: "Puumala", available_packages: 2 }),
      normalizeConsumerListing({ id: 2, species: "Ahven", municipality: "Mikkeli", available_packages: 0 }),
    ];
    expect(filterConsumerListings(listings, { search: "puu" }).map((item) => item.id)).toEqual(["1"]);
    expect(filterConsumerListings(listings, { species: "Ahven" })).toEqual([]);
  });

  it("hides listings after their ordering deadline", () => {
    const listings = [normalizeConsumerListing({
      id: "expired-listing",
      species: "Muikku",
      available_packages: 2,
      order_deadline: "2020-01-01T00:00:00.000Z",
    })];
    expect(filterConsumerListings(listings)).toEqual([]);
  });

  it("preserves the pickup window and ordering deadline for the public listing", () => {
    expect(normalizeConsumerListing({
      id: "listing-1",
      available_packages: 1,
      pickup_start: "2026-09-12T09:00:00.000Z",
      pickup_end: "2026-09-12T10:00:00.000Z",
      order_deadline: "2026-09-12T07:00:00.000Z",
      payment_methods: ["MobilePay", "Käteinen"],
    })).toMatchObject({
      pickupStart: "2026-09-12T09:00:00.000Z",
      pickupEnd: "2026-09-12T10:00:00.000Z",
      orderDeadline: "2026-09-12T07:00:00.000Z",
      paymentMethods: ["MobilePay", "Käteinen"],
    });
  });

  it("normalizes and formats consumer payment methods", () => {
    expect(normalizeConsumerPaymentMethods([" MobilePay ", "Käteinen", "MobilePay", ""])).toEqual(["MobilePay", "Käteinen"]);
    expect(formatConsumerPaymentMethods(["MobilePay", "Käteinen"])).toBe("MobilePay, Käteinen");
    expect(formatConsumerPaymentMethods([])).toBe("Sovitaan kalastajan kanssa");
  });

  it("separates listings whose pickup window has ended", () => {
    const now = new Date("2026-09-06T12:00:00.000Z");
    expect(isConsumerListingPickupEnded({ pickup_end: "2026-09-06T11:59:59.000Z" }, now)).toBe(true);
    expect(isConsumerListingPickupEnded({ pickupEnd: "2026-09-06T12:00:00.000Z" }, now)).toBe(true);
    expect(isConsumerListingPickupEnded({ pickup_end: "2026-09-06T12:00:01.000Z" }, now)).toBe(false);
    expect(isConsumerListingPickupEnded({ pickup_end: "" }, now)).toBe(false);
  });

  it("estimates whole-fish reservations by size class and pieces", () => {
    expect(calculateConsumerReservationEstimate({
      variant: { unitType: "whole_fish", minWeightKg: 1, maxWeightKg: 2, pricePerKg: 10 },
      unitCount: 2,
    })).toMatchObject({ grossTotal: 30, estimatedWeightKg: 3, isEstimate: true });
  });

  it("allows 2.5 kg as five half-kilo packages", () => {
    expect(calculateConsumerReservationEstimate({
      variant: { unitType: "package", packageSizeKg: 0.5, unitPrice: 6.9 },
      unitCount: 5,
    })).toMatchObject({ grossTotal: 34.5, estimatedWeightKg: 2.5, isEstimate: false });
  });

  it("combines several package sizes into one reservation", () => {
    expect(calculateConsumerReservationBasket({
      variants: [
        { id: "one-kilo", unitType: "package", packageSizeKg: 1, unitPrice: 12, availableUnits: 10 },
        { id: "half-kilo", unitType: "package", packageSizeKg: 0.5, unitPrice: 6.5, availableUnits: 10 },
      ],
      quantities: { "one-kilo": 4, "half-kilo": 1 },
    })).toMatchObject({
      estimatedWeightKg: 4.5,
      grossTotal: 54.5,
      lines: [
        { unitCount: 4, variant: { id: "one-kilo" } },
        { unitCount: 1, variant: { id: "half-kilo" } },
      ],
    });
  });
});
