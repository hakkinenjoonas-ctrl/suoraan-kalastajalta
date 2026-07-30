import fs from "node:fs/promises";
import path from "node:path";
import {
  createDeliveryNotePdf,
  DELIVERY_NOTE_FORMATS,
} from "../src/lib/deliveryNote.js";

const outputDir = process.argv[2] || "/tmp/delivery-note-samples";
await fs.mkdir(outputDir, { recursive: true });

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

for (const format of Object.values(DELIVERY_NOTE_FORMATS)) {
  const { doc } = createDeliveryNotePdf(payload, format);
  const pdfBytes = Buffer.from(doc.output("arraybuffer"));
  await fs.writeFile(path.join(outputDir, `${format}.pdf`), pdfBytes);
}
