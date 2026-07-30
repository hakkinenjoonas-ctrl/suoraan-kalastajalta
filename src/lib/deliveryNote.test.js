import { describe, expect, it } from "vitest";
import {
  createDeliveryNotePdf,
  DELIVERY_NOTE_FORMATS,
} from "./deliveryNote.js";

const payload = {
  number: "LAH-20260730-TESTI001",
  shipmentDate: "2026-07-30",
  sender: {
    name: "Saimaan Kalastuspalvelu Oy",
    address: "Satamatie 123, 53100 Lappeenranta",
    businessId: "1234567-8",
    contactName: "Matti Kalastaja",
    email: "kalastaja@example.fi",
    phone: "040 123 4567",
  },
  recipient: {
    name: "Pitkänniminen Keskusliike ja Kalatukku Oy",
    address: "Vastaanottajankatu 456 B 12, 00100 Helsinki",
    businessId: "2345678-9",
    contactName: "Oona Ostaja",
    email: "ostaja@example.fi",
    phone: "050 987 6543",
  },
  products: [{
    description: "Kuha",
    scientificName: "Sander lucioperca",
    faoCode: "FPP",
    quantity: "125 kg",
    batchId: "ERA-20260730-001",
    catchDate: "2026-07-30",
    catchArea: "Saimaa / Lappeenranta / Suurselkä",
    vesselId: "FIN-12345",
    productionMethod: "Tuotantomenetelmä: pyydetty (sisävesi)",
    frozenStatus: "Tuotteen tila: tuore, ei ilmoitettu aiemmin jäädytetyksi",
  }],
  delivery: {
    method: "Kylmäkuljetus",
    coldTransport: true,
    earliestDate: "2026-07-31",
    storage: "Tuore kala säilytetään ja kuljetetaan lähellä sulavan jään lämpötilaa (0–+2 °C).",
  },
};

describe("delivery note PDF", () => {
  it.each([
    [DELIVERY_NOTE_FORMATS.A4, 210, 297],
    [DELIVERY_NOTE_FORMATS.MUNBYN_4X3, 101.6, 76.2],
    [DELIVERY_NOTE_FORMATS.MUNBYN_4X6, 102, 152],
  ])("creates %s with the requested physical size", (format, expectedWidth, expectedHeight) => {
    const { doc, fileName } = createDeliveryNotePdf(payload, format);
    expect(doc.internal.getNumberOfPages()).toBe(1);
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(expectedWidth, 1);
    expect(doc.internal.pageSize.getHeight()).toBeCloseTo(expectedHeight, 1);
    expect(fileName).toMatch(/\.pdf$/);
  });
});
