import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildConsumerCustomerCardsPdf } from "../src/lib/consumerCustomerCards.js";

const projectRoot = resolve(import.meta.dirname, "..");
const logo = await readFile(resolve(projectRoot, "public/logo.png"));
const logoDataUrl = `data:image/png;base64,${logo.toString("base64")}`;
const document = buildConsumerCustomerCardsPdf([
  {
    id: "b85de037-demo",
    customerName: "Häkkinen Simo Joonas",
    customerPhone: "040 123 4567",
    productName: "Muikku",
    pickupLocation: "Kyläniemen kalasatama",
    batchId: "MUIKKU-2026-0910",
    lines: [
      { id: "line-1", label: "1 kg pakkaus", unitCount: 2, total: 8, priceIsFinal: true },
    ],
    total: 8,
    priceIsFinal: true,
  },
], { logoDataUrl });

const outputDirectory = resolve(projectRoot, "output/pdf");
const outputPath = resolve(outputDirectory, "kuluttajamyynnin-asiakaskortti-esikatselu.pdf");
await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, Buffer.from(document.output("arraybuffer")));
console.log(outputPath);
