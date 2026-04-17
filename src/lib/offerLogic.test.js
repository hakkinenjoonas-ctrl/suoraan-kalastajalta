import { describe, expect, it } from "vitest";

import {
  buildPushEventHeadline,
  buyerStatusLabel,
  getAcceptedInvoiceSourceLabel,
  offersShareSameLot,
} from "./offerLogic.js";

describe("offerLogic", () => {
  describe("offersShareSameLot", () => {
    it("matches offers by identical batch id for the same seller", () => {
      expect(offersShareSameLot(
        { seller_user_id: "seller-1", batch_id: "BATCH-123" },
        { seller_user_id: "seller-1", batch_id: "BATCH-123" },
      )).toBe(true);
    });

    it("matches offers by fallback lot fields when batch id is missing", () => {
      expect(offersShareSameLot(
        {
          seller_user_id: "seller-1",
          species_summary: "Kuha: 10 kg",
          total_kilos: 10,
          area: "Saimaa",
          spot: "Puumala",
        },
        {
          seller_user_id: "seller-1",
          species_summary: "Kuha: 10 kg",
          total_kilos: 10,
          area: "Saimaa",
          spot: "Puumala",
        },
      )).toBe(true);
    });

    it("does not match offers from different sellers", () => {
      expect(offersShareSameLot(
        { seller_user_id: "seller-1", batch_id: "BATCH-123" },
        { seller_user_id: "seller-2", batch_id: "BATCH-123" },
      )).toBe(false);
    });
  });

  describe("getAcceptedInvoiceSourceLabel", () => {
    it("prefers accepted counter offers over reservation text", () => {
      expect(getAcceptedInvoiceSourceLabel({
        counter_price_per_kg: 6.5,
        reserved_kilos: 10,
      })).toBe("Viimeisin hyväksytty vastatarjous");
    });

    it("uses reservation label when reserved kilos exist without counter offer", () => {
      expect(getAcceptedInvoiceSourceLabel({
        counter_price_per_kg: "",
        reserved_kilos: 12,
      })).toBe("Viimeisin hyväksytty varaus");
    });

    it("falls back to generic accepted offer label", () => {
      expect(getAcceptedInvoiceSourceLabel({
        counter_price_per_kg: "",
        reserved_kilos: "",
      })).toBe("Hyväksytty tarjous");
    });
  });

  describe("buildPushEventHeadline", () => {
    it("strips traceability text from push headlines", () => {
      expect(buildPushEventHeadline({
        species_summary: "Ahven: 15 kg · Erätunnus 10303-260411FPE39-6",
      })).toBe("Ahven");
    });

    it("preserves product variants in push headlines", () => {
      expect(buildPushEventHeadline({
        species_summary: "Kuha filee: 15 kg",
      })).toBe("Kuha filee");
    });

    it("returns a default headline when species summary is missing", () => {
      expect(buildPushEventHeadline({})).toBe("Kalaerä");
    });
  });

  describe("buyerStatusLabel", () => {
    it("maps reserved to a clear Finnish label", () => {
      expect(buyerStatusLabel("reserved")).toBe("Varattu");
    });

    it("falls back to raw status for unknown values", () => {
      expect(buyerStatusLabel("custom-status")).toBe("custom-status");
    });
  });
});
