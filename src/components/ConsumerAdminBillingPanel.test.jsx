import { describe, expect, it } from "vitest";
import { groupConsumerCommissionReservations } from "../lib/consumerAdminBilling.js";

describe("consumer admin billing", () => {
  it("groups all package sizes in one commissionable reservation", () => {
    const reservations = groupConsumerCommissionReservations([
      { id: "line-1", reservation_group_id: "reservation-1", variant_label: "1 kg", unit_count: 4, total_including_vat: 40, net_trade_value: 35.24, commission_amount: 2.82, commission_status: "unbilled" },
      { id: "line-2", reservation_group_id: "reservation-1", variant_label: "0,5 kg", unit_count: 1, total_including_vat: 5, net_trade_value: 4.41, commission_amount: 0.35, commission_status: "unbilled" },
    ]);

    expect(reservations).toHaveLength(1);
    expect(reservations[0]).toMatchObject({
      id: "reservation-1",
      lines: ["4 × 1 kg", "1 × 0,5 kg"],
      totalIncludingVat: 45,
      netTradeValue: 39.65,
      commissionAmount: 3.17,
    });
  });

  it("keeps cancelled consumer orders in billing", () => {
    const [reservation] = groupConsumerCommissionReservations([
      { id: "cancelled-1", order_status: "cancelled", net_trade_value: 10, commission_amount: 0.8 },
    ]);
    expect(reservation.order_status).toBe("cancelled");
    expect(reservation.commissionAmount).toBe(0.8);
  });
});
