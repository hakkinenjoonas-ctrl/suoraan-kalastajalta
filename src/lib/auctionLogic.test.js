import { describe, expect, it } from "vitest";
import {
  extractAuctionAdditionalNotes,
  formatAuctionRemaining,
  minimumNextBid,
  normalizeAuctionMoney,
  validateAuctionDraft,
} from "./auctionLogic.js";

describe("auction logic", () => {
  it("normalizes Finnish decimal input", () => {
    expect(normalizeAuctionMoney("5,27")).toBe(5.27);
  });

  it("accepts the three-hour default", () => {
    expect(validateAuctionDraft({ entryId: "entry", durationMinutes: 180, startingPrice: "4,00", minimumIncrement: "0,20", reservePrice: "5,00" })).toBe("");
  });

  it("rejects a reserve below the starting price", () => {
    expect(validateAuctionDraft({ entryId: "entry", durationMinutes: 180, startingPrice: 5, minimumIncrement: 0.2, reservePrice: 4 })).toMatch(/Pohjahinta/);
  });

  it("calculates the minimum next bid", () => {
    expect(minimumNextBid({ current_price_per_kg: 5.1, minimum_increment: 0.2 })).toBe(5.3);
  });

  it("formats a short countdown", () => {
    expect(formatAuctionRemaining(181000)).toBe("3:01");
  });

  it("shows the fisher's notes without internal catch details", () => {
    const notes = "Kalojen koko 1–2 kg.\nErittäin hyvä laatu.\nPyydyksen ja saaliin lisätiedot:\nVerkon korkeus: 3 m\nPurkamispaikka: Satama";
    expect(extractAuctionAdditionalNotes(notes)).toBe("Kalojen koko 1–2 kg.\nErittäin hyvä laatu.");
  });

  it("returns an empty value when only internal details exist", () => {
    expect(extractAuctionAdditionalNotes("Pyydyksen ja saaliin lisätiedot:\nVerkon korkeus: 3 m")).toBe("");
  });
});
