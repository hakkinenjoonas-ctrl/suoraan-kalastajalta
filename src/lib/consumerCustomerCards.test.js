import { describe, expect, it } from "vitest";
import {
  buildConsumerCustomerCardsPdf,
  CONSUMER_CUSTOMER_CARD_HEIGHT_MM,
  CONSUMER_CUSTOMER_CARD_WIDTH_MM,
  groupConsumerOrdersForCustomerCards,
} from "./consumerCustomerCards.js";

describe("consumer customer cards", () => {
  it("combines package sizes from one reservation onto one customer card", () => {
    const cards = groupConsumerOrdersForCustomerCards([
      { id: "line-1", reservation_group_id: "group-1", consumer_name: "Maija Mallikas", product_name: "Muikku", sale_unit_type: "package", variant_label: "1 kg", unit_count: 4, total_including_vat: 40 },
      { id: "line-2", reservation_group_id: "group-1", consumer_name: "Maija Mallikas", product_name: "Muikku", sale_unit_type: "package", variant_label: "0,5 kg", unit_count: 1, total_including_vat: 5 },
    ]);

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      id: "group-1",
      customerName: "Maija Mallikas",
      productName: "Muikku",
      total: 45,
      priceIsFinal: true,
      lines: [
        { label: "1 kg", unitCount: 4 },
        { label: "0,5 kg", unitCount: 1 },
      ],
    });
  });

  it("uses a handwritten price field until a whole fish has been weighed", () => {
    const [card] = groupConsumerOrdersForCustomerCards([
      { id: "line-1", consumer_name: "Matti Meikäläinen", product_name: "Kuha", sale_unit_type: "whole_fish", variant_label: "1,2–1,5 kg", unit_count: 2, total_including_vat: 27 },
    ]);
    expect(card.priceIsFinal).toBe(false);
  });

  it("creates one landscape MUNBYN 4x3 inch page per customer card", () => {
    const cards = groupConsumerOrdersForCustomerCards([
      { id: "line-1", consumer_name: "Maija Mallikas", product_name: "Muikku", sale_unit_type: "package", variant_label: "1 kg", unit_count: 2, total_including_vat: 20 },
      { id: "line-2", consumer_name: "Matti Meikäläinen", product_name: "Kuha", sale_unit_type: "whole_fish", variant_label: "1,2–1,5 kg", unit_count: 1, total_including_vat: 15 },
    ]);
    const doc = buildConsumerCustomerCardsPdf(cards);

    expect(doc.getNumberOfPages()).toBe(2);
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(CONSUMER_CUSTOMER_CARD_WIDTH_MM, 1);
    expect(doc.internal.pageSize.getHeight()).toBeCloseTo(CONSUMER_CUSTOMER_CARD_HEIGHT_MM, 1);
  });
});
