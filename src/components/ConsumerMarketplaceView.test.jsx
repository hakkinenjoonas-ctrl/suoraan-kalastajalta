import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ConsumerMarketplaceView, { pickupPlace, reservationUnitLabel, variantOptionLabel } from "./ConsumerMarketplaceView.jsx";

describe("ConsumerMarketplaceView", () => {
  it("does not show kilograms for piece-priced crayfish", () => {
    const label = variantOptionLabel({ unitType: "piece", label: "11+ cm", unitPrice: 3.5, packageSizeKg: 0 });

    expect(label).toBe("11+ cm · 3,50 €/kpl");
    expect(label).not.toContain("kg");
    expect(reservationUnitLabel({ unitType: "piece" })).toBe("kpl");
  });

  it("adds the municipality to a street-only pickup location without duplicating it", () => {
    expect(pickupPlace({ pickupLocation: "Kapteeninkatu 28", municipality: "Lappeenranta" })).toBe("Kapteeninkatu 28, Lappeenranta");
    expect(pickupPlace({ pickupLocation: "Kapteeninkatu 28, Lappeenranta", municipality: "Lappeenranta" })).toBe("Kapteeninkatu 28, Lappeenranta");
  });

  it("shows pickup time and place prominently on each consumer reservation card", () => {
    const html = renderToStaticMarkup(
      <ConsumerMarketplaceView
        listings={[]}
        soldListings={[{
          id: "sold-1",
          productName: "Myyty muikkuerä",
          species: "Muikku",
          sellerName: "Testi Kalastaja Oy",
          municipality: "Savonlinna",
          imageUrl: "",
          variants: [{ unitType: "package", unitPrice: 8 }],
        }]}
        orders={[{
          id: "order-1",
          reservation_group_id: "9863fb85-0000-0000-0000-000000000000",
          status: "reserved",
          product_name: "Ahven",
          unit_count: 4,
          variant_label: "ahven 2",
          total_including_vat: 23.5,
          pickup_start: "2026-09-11T09:00:00.000Z",
          pickup_end: "2026-09-11T10:00:00.000Z",
          pickup_location: "Kyläniemen kalasatama",
          payment_methods: ["Käteinen"],
          seller_name: "Testi Kalastaja Oy",
        }]}
        loading={false}
        error=""
        user={{ email: "kuluttaja@example.fi", user_metadata: { display_name: "Testikuluttaja" } }}
        consumerProfile={{ displayName: "Testikuluttaja", phone: "" }}
        busy={false}
        message=""
        onOpenAuth={() => {}}
        onSignOut={() => {}}
        onSaveOwnDetails={() => true}
        onDeleteOwnAccount={() => true}
        onRefresh={() => {}}
        onReserve={() => true}
        onSubscribe={() => true}
        onUnsubscribe={() => true}
      />,
    );

    expect(html).toContain("Omat varaukset");
    expect(html).toContain("Myydyt");
    expect(html).toContain("1 erä");
    expect(html).toContain("Noutoaika");
    expect(html).toContain("Noutopaikka");
    expect(html).toContain("Kyläniemen kalasatama");
    expect(html).toContain("Maksutavat:");
    expect(html).toContain("Käteinen");
    expect(html).toContain("23,50");
    expect(html).toContain("9863FB85");
  });

  it("shows piece-priced crayfish stock and price", () => {
    const html = renderToStaticMarkup(
      <ConsumerMarketplaceView
        listings={[{
          id: "crayfish-1", productName: "Täplärapu", species: "Täplärapu", sellerName: "Testikalastaja",
          municipality: "Taipalsaari", availableUnits: 250, status: "published", orderDeadline: "2099-09-17T12:00:00.000Z",
          variants: [{ id: "12-plus", unitType: "piece", label: "12+ cm", unitPrice: 3.5, availableUnits: 80 }],
        }]}
        soldListings={[]}
        orders={[]}
        loading={false}
        error=""
        user={null}
        busy={false}
        message=""
        onOpenAuth={() => {}}
        onReturnToMainApp={() => {}}
        onSignOut={() => {}}
        onSaveOwnDetails={() => true}
        onDeleteOwnAccount={() => true}
        onRefresh={() => {}}
        onReserve={() => true}
        onSubscribe={() => true}
        onUnsubscribe={() => true}
      />,
    );

    expect(html).toContain("Rapuja kappaleittain");
    expect(html).toContain("250 kpl");
    expect(html).toContain("sis. ALV / kpl alkaen");
  });

  it("omits the ready-package badge and shows pickup street with municipality", () => {
    const html = renderToStaticMarkup(
      <ConsumerMarketplaceView
        listings={[{
          id: "fish-1", productName: "Ahven", species: "Ahven", sellerName: "Testikalastaja",
          municipality: "Lappeenranta", pickupLocation: "Kapteeninkatu 28", availableUnits: 10,
          status: "published", orderDeadline: "2099-09-17T12:00:00.000Z",
          variants: [{ id: "one-kilo", unitType: "package", label: "1 kg", packageSizeKg: 1, unitPrice: 12, availableUnits: 10 }],
        }]}
        soldListings={[]}
        orders={[]}
        loading={false}
        error=""
        user={null}
        busy={false}
        message=""
        onOpenAuth={() => {}}
        onReturnToMainApp={() => {}}
        onSignOut={() => {}}
        onSaveOwnDetails={() => true}
        onDeleteOwnAccount={() => true}
        onRefresh={() => {}}
        onReserve={() => true}
        onSubscribe={() => true}
        onUnsubscribe={() => true}
      />,
    );

    expect(html).not.toContain("Valmiita pakkauksia");
    expect(html).toContain("Kapteeninkatu 28, Lappeenranta");
  });
});
