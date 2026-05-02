import { describe, expect, it } from "vitest";

import {
  BUYER_OFFER_ACTION_REQUIRED_STATUSES,
  BUYER_OFFER_OPEN_RESPONSE_STATUSES,
  BUYER_OFFER_STATUS,
  buildOpenOfferedEntriesSummary,
  buildPushEventHeadline,
  buyerStatusLabel,
  getBuyerOfferAcceptanceActionLabel,
  getBuyerOffersFilterForStatus,
  getAcceptedInvoiceSourceLabel,
  getOfferSpeciesHeadline,
  hasBuyerOfferStatus,
  isBuyerOfferAccepted,
  offersShareSameLot,
  shouldRevealBuyerIdentityForStatus,
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

  describe("getOfferSpeciesHeadline", () => {
    it("strips duplicate price and meta details from the headline", () => {
      expect(getOfferSpeciesHeadline(
        "Kuha: 50 kg · Hinta ALV 0 % 8 € / kg · Hinta sis. ALV 13,5 % 9,08 € / kg · Pyyntipäivämäärä 2026-04-30 · Erätunnus FIN23456260430FPP50-3",
        { hideTraceability: true },
      )).toBe("Kuha");
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

  describe("status helpers", () => {
    it("recognizes accepted status centrally", () => {
      expect(isBuyerOfferAccepted(BUYER_OFFER_STATUS.ACCEPTED)).toBe(true);
      expect(shouldRevealBuyerIdentityForStatus(BUYER_OFFER_STATUS.ACCEPTED)).toBe(true);
    });

    it("matches status sets through shared helper", () => {
      expect(hasBuyerOfferStatus(BUYER_OFFER_STATUS.SENT, BUYER_OFFER_OPEN_RESPONSE_STATUSES)).toBe(true);
      expect(hasBuyerOfferStatus(BUYER_OFFER_STATUS.COUNTERED, BUYER_OFFER_ACTION_REQUIRED_STATUSES)).toBe(true);
    });

    it("returns correct acceptance action label", () => {
      expect(getBuyerOfferAcceptanceActionLabel(BUYER_OFFER_STATUS.RESERVED)).toBe("Hyväksy varaus");
      expect(getBuyerOfferAcceptanceActionLabel(BUYER_OFFER_STATUS.COUNTERED)).toBe("Hyväksy vastatarjous");
      expect(getBuyerOfferAcceptanceActionLabel(BUYER_OFFER_STATUS.SENT)).toBe("Hyväksy kauppa");
    });

    it("maps statuses to buyer offer filters", () => {
      expect(getBuyerOffersFilterForStatus(BUYER_OFFER_STATUS.ACCEPTED)).toBe("accepted");
      expect(getBuyerOffersFilterForStatus(BUYER_OFFER_STATUS.RESERVED)).toBe("reserved");
      expect(getBuyerOffersFilterForStatus(BUYER_OFFER_STATUS.REJECTED)).toBe("rejected");
    });
  });

  describe("buildOpenOfferedEntriesSummary", () => {
    it("groups a mixed offer into one open summary card", () => {
      const summary = buildOpenOfferedEntriesSummary([
        {
          entry: {
            id: "entry-1",
            species: "Ahven",
            kilos: 20,
            date: "2026-05-01",
            area: "Suur-Saimaa",
            municipality: "",
            spot: "Taipalsaari",
          },
          reservation: null,
          buyerMatches: [{
            id: "offer-1",
            species_summary: "Ahven: 20 kg · Erätunnus A1\nHauki: 30 kg · Erätunnus H1",
          }],
        },
        {
          entry: {
            id: "entry-2",
            species: "Hauki",
            kilos: 30,
            date: "2026-05-01",
            area: "Suur-Saimaa",
            municipality: "",
            spot: "Taipalsaari",
          },
          reservation: null,
          buyerMatches: [{
            id: "offer-1",
            species_summary: "Ahven: 20 kg · Erätunnus A1\nHauki: 30 kg · Erätunnus H1",
          }],
        },
      ], (value) => value);

      expect(summary).toHaveLength(1);
      expect(summary[0].species).toBe("Monilajinen erä");
      expect(summary[0].kilos).toBe(50);
      expect(summary[0].mixedSummary).toBe("Ahven, Hauki");
      expect(summary[0].buyerCount).toBe(1);
    });

    it("keeps separate entries separate when they do not share buyer matches", () => {
      const summary = buildOpenOfferedEntriesSummary([
        {
          entry: {
            id: "entry-1",
            species: "Ahven",
            kilos: 20,
            date: "2026-05-01",
            area: "Suur-Saimaa",
            municipality: "",
            spot: "Taipalsaari",
          },
          reservation: null,
          buyerMatches: [],
        },
        {
          entry: {
            id: "entry-2",
            species: "Hauki",
            kilos: 30,
            date: "2026-05-01",
            area: "Suur-Saimaa",
            municipality: "",
            spot: "Taipalsaari",
          },
          reservation: null,
          buyerMatches: [{
            id: "offer-2",
            species_summary: "Hauki: 30 kg · Erätunnus H1",
          }],
        },
      ], (value) => value);

      expect(summary).toHaveLength(2);
    });
  });
});
