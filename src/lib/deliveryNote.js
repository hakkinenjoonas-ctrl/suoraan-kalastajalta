import { jsPDF } from "jspdf";

export const DELIVERY_NOTE_FORMATS = {
  A4: "a4",
  MUNBYN_4X3: "munbyn_4x3",
  MUNBYN_4X6: "munbyn_4x6",
};

export const DELIVERY_NOTE_FORMAT_OPTIONS = [
  { value: DELIVERY_NOTE_FORMATS.A4, label: "A4" },
  { value: DELIVERY_NOTE_FORMATS.MUNBYN_4X3, label: "MUNBYN 4x3" },
  { value: DELIVERY_NOTE_FORMATS.MUNBYN_4X6, label: "MUNBYN 4x6" },
];

export function getDeliveryNotePageSpec(format) {
  if (format === DELIVERY_NOTE_FORMATS.MUNBYN_4X3) {
    return { width: 101.6, height: 76.2, orientation: "landscape", format: [101.6, 76.2] };
  }
  if (format === DELIVERY_NOTE_FORMATS.MUNBYN_4X6) {
    return { width: 102, height: 152, orientation: "portrait", format: [102, 152] };
  }
  return { width: 210, height: 297, orientation: "portrait", format: "a4" };
}

function clean(value, fallback = "-") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function fitLines(doc, text, maxWidth, maxLines) {
  const lines = doc.splitTextToSize(clean(text), maxWidth);
  if (lines.length <= maxLines) return lines;
  const clipped = lines.slice(0, maxLines);
  const last = String(clipped[maxLines - 1] || "");
  clipped[maxLines - 1] = `${last.slice(0, Math.max(1, last.length - 3)).trim()}...`;
  return clipped;
}

function drawWrapped(doc, text, x, y, width, lineHeight, maxLines = 99) {
  const lines = fitLines(doc, text, width, maxLines);
  doc.text(lines, x, y);
  return y + (lines.length * lineHeight);
}

function drawPartyBox(doc, {
  title,
  party,
  x,
  y,
  width,
  height,
  titleSize,
  nameSize,
  addressSize,
  padding,
  showDetails = true,
  detailsMode = "full",
}) {
  doc.setDrawColor(148, 163, 184);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(x, y, width, height, 2, 2, "FD");
  doc.setTextColor(71, 85, 105);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(titleSize);
  doc.text(title.toUpperCase(), x + padding, y + padding + titleSize * 0.24);

  let cursorY = y + padding + titleSize * 0.24 + (nameSize * 0.48);
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(nameSize);
  doc.setFont("helvetica", "bold");
  cursorY = drawWrapped(doc, clean(party?.name), x + padding, cursorY, width - (padding * 2), nameSize * 0.38, 2);

  doc.setFontSize(addressSize);
  doc.setFont("helvetica", "bold");
  cursorY = drawWrapped(doc, clean(party?.address), x + padding, cursorY + addressSize * 0.2, width - (padding * 2), addressSize * 0.38, 2);

  const details = detailsMode === "phone"
    ? (party?.phone ? `Puh: ${party.phone}` : "")
    : [
      party?.businessId ? `Y-tunnus: ${party.businessId}` : "",
      party?.contactName ? `Yhteyshenkilö: ${party.contactName}` : "",
      party?.phone ? `Puhelin: ${party.phone}` : "",
    ].filter(Boolean).join("\n");
  if (showDetails && details && cursorY < y + height - padding) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(Math.max(5.5, addressSize - 2));
    drawWrapped(doc, details, x + padding, cursorY + 1, width - (padding * 2), Math.max(2.5, (addressSize - 2) * 0.38), detailsMode === "phone" ? 1 : 4);
  }
}

function buildProductHeadline(product) {
  return [
    clean(product?.description, "Kalaerä"),
    product?.scientificName ? `(${product.scientificName})` : "",
    product?.faoCode ? `FAO ${product.faoCode}` : "",
  ].filter(Boolean).join(" ");
}

function buildTraceabilityLines(product) {
  return [
    `Määrä: ${clean(product?.quantity)}`,
    `Erätunnus: ${clean(product?.batchId)}`,
    product?.catchDate ? `Pyyntipäivä: ${product.catchDate}` : "",
    product?.catchArea ? `Pyyntialue: ${product.catchArea}` : "",
    product?.vesselId ? `Alus/tunnus: ${product.vesselId}` : "",
    product?.productionMethod ? product.productionMethod : "",
    product?.frozenStatus ? product.frozenStatus : "",
  ].filter(Boolean);
}

function drawA4(doc, payload) {
  const margin = 15;
  const pageWidth = 210;
  let y = 14;

  doc.setFillColor(239, 246, 255);
  doc.rect(0, 0, pageWidth, 38, "F");
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text("LÄHETYSLISTA", margin, y + 8);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Numero: ${clean(payload.number)}`, 195, y + 1, { align: "right" });
  doc.text(`Lähetyspäivä: ${clean(payload.shipmentDate)}`, 195, y + 7, { align: "right" });
  doc.text("Kalastustuotteen kaupallinen asiakirja", margin, y + 16);

  y = 47;
  drawPartyBox(doc, {
    title: "Lähettäjä",
    party: payload.sender,
    x: margin,
    y,
    width: 86,
    height: 55,
    titleSize: 9,
    nameSize: 15,
    addressSize: 11,
    padding: 5,
  });
  drawPartyBox(doc, {
    title: "Vastaanottaja / toimitusosoite",
    party: payload.recipient,
    x: 106,
    y,
    width: 89,
    height: 55,
    titleSize: 9,
    nameSize: 17,
    addressSize: 13,
    padding: 5,
  });

  y = 115;
  doc.setFillColor(15, 23, 42);
  doc.rect(margin, y - 6, 180, 9, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("LÄHETYKSEN SISÄLTÖ JA JÄLJITETTÄVYYS", margin + 3, y);
  y += 9;

  (payload.products || []).forEach((product, index) => {
    if (y > 244) {
      doc.addPage("a4", "portrait");
      y = 20;
    }
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    y = drawWrapped(doc, `${index + 1}. ${buildProductHeadline(product)}`, margin, y, 180, 5, 3);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    const detailLines = buildTraceabilityLines(product);
    detailLines.forEach((line) => {
      y = drawWrapped(doc, line, margin + 5, y + 1, 174, 4.2, 2);
    });
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y + 2, 195, y + 2);
    y += 8;
  });

  const deliveryLines = [
    `Toimitustapa: ${clean(payload.delivery?.method)}`,
    `Kylmäkuljetus: ${payload.delivery?.coldTransport ? "Kyllä" : "Ei / ei ilmoitettu"}`,
    payload.delivery?.storage ? `Säilytys ja kuljetus: ${payload.delivery.storage}` : "",
    payload.delivery?.earliestDate ? `Sovittu/aikaisin toimitus: ${payload.delivery.earliestDate}` : "",
    payload.delivery?.notes ? `Lisätiedot: ${payload.delivery.notes}` : "",
  ].filter(Boolean);
  if (y > 250) {
    doc.addPage("a4", "portrait");
    y = 20;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Toimitustiedot", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  deliveryLines.forEach((line) => {
    y = drawWrapped(doc, line, margin, y + 5, 180, 4.2, 2);
  });

  const signatureY = Math.max(y + 12, 264);
  doc.setDrawColor(148, 163, 184);
  doc.line(margin, signatureY, 91, signatureY);
  doc.line(111, signatureY, 195, signatureY);
  doc.setFontSize(8);
  doc.text("Lähettäjän kuittaus / päivämäärä", margin, signatureY + 4);
  doc.text("Vastaanottajan kuittaus / päivämäärä", 111, signatureY + 4);
  doc.setTextColor(100, 116, 139);
  doc.text("Asiakirja on säilytettävä osana elintarvikkeen jäljitettävyystietoja.", margin, 290);
}

function drawMunbyn4x6(doc, payload) {
  const margin = 4.5;
  let y = 7;
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("LÄHETYSLISTA", margin, y);
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.text(`${clean(payload.number)} / ${clean(payload.shipmentDate)}`, 97.5, y, { align: "right" });

  y = 12;
  drawPartyBox(doc, {
    title: "Vastaanottaja / toimitusosoite",
    party: payload.recipient,
    x: margin,
    y,
    width: 93,
    height: 37,
    titleSize: 7,
    nameSize: 15,
    addressSize: 11,
    padding: 3.2,
  });
  y = 53;
  drawPartyBox(doc, {
    title: "Lähettäjä",
    party: payload.sender,
    x: margin,
    y,
    width: 93,
    height: 28,
    titleSize: 6.5,
    nameSize: 10,
    addressSize: 8,
    padding: 3,
  });

  y = 87;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("ERÄ JA JÄLJITETTÄVYYS", margin, y);
  y += 4.5;
  (payload.products || []).slice(0, 4).forEach((product, index) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.2);
    y = drawWrapped(doc, `${index + 1}. ${buildProductHeadline(product)}`, margin, y, 93, 3, 2);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.2);
    const compact = [
      `${clean(product.quantity)} / erä ${clean(product.batchId)}`,
      [product.catchDate, product.catchArea, product.vesselId].filter(Boolean).join(" / "),
    ].filter(Boolean);
    compact.forEach((line) => {
      y = drawWrapped(doc, line, margin + 2, y + 0.5, 91, 2.7, 2);
    });
    y += 2;
  });

  doc.setDrawColor(203, 213, 225);
  doc.line(margin, 135, 97.5, 135);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.2);
  doc.text(`Toimitus: ${clean(payload.delivery?.method)} / Kylmäkuljetus: ${payload.delivery?.coldTransport ? "kyllä" : "ei"}`, margin, 139);
  doc.text(clean(payload.delivery?.storage, "Tuore kala lähellä sulavan jään lämpötilaa."), margin, 143);
  doc.setFontSize(5.5);
  doc.setTextColor(100, 116, 139);
  doc.text("Säilytä lähetyksen jäljitettävyysasiakirjana.", margin, 148);
}

function drawMunbyn4x3(doc, payload) {
  const margin = 3.5;
  let y = 5.5;
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.text("LÄHETYSLISTA", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.3);
  doc.text(`${clean(payload.number)} / ${clean(payload.shipmentDate)}`, 98, y, { align: "right" });

  y = 9;
  drawPartyBox(doc, {
    title: "Vastaanottaja",
    party: payload.recipient,
    x: margin,
    y,
    width: 53,
    height: 27,
    titleSize: 5.5,
    nameSize: 10.5,
    addressSize: 8.2,
    padding: 2.2,
    detailsMode: "phone",
  });
  drawPartyBox(doc, {
    title: "Lähettäjä",
    party: payload.sender,
    x: 59,
    y,
    width: 39,
    height: 27,
    titleSize: 5.5,
    nameSize: 7.4,
    addressSize: 6.2,
    padding: 2.2,
    detailsMode: "phone",
  });

  y = 41;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.2);
  doc.text("SISÄLTÖ / JÄLJITETTÄVYYS", margin, y);
  y += 3.5;
  (payload.products || []).slice(0, 3).forEach((product, index) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.7);
    const headline = `${index + 1}. ${clean(product.description, "Kalaerä")} ${product.faoCode ? `FAO ${product.faoCode}` : ""} - ${clean(product.quantity)}`;
    y = drawWrapped(doc, headline, margin, y, 94.5, 2.4, 1);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.2);
    const trace = `Erä ${clean(product.batchId)} / ${clean(product.catchDate)} / ${clean(product.catchArea)}${product.vesselId ? ` / ${product.vesselId}` : ""}`;
    y = drawWrapped(doc, trace, margin + 1.5, y + 0.3, 93, 2.2, 2);
    y += 1.1;
  });
  if ((payload.products || []).length > 3) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.2);
    doc.text(`+ ${(payload.products || []).length - 3} muuta erää — täydet tiedot A4-lähetyslistassa`, margin, Math.min(y + 0.8, 64.5));
  }

  doc.setDrawColor(203, 213, 225);
  doc.line(margin, 67, 98, 67);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.1);
  doc.text(`Toimitus: ${clean(payload.delivery?.method)} / Kylmä: ${payload.delivery?.coldTransport ? "kyllä" : "ei"}`, margin, 70.3);
  doc.setTextColor(100, 116, 139);
  doc.text("Kalastustuotteen jäljitettävyysasiakirja", 98, 74, { align: "right" });
}

export function createDeliveryNotePdf(payload, format = DELIVERY_NOTE_FORMATS.A4) {
  const spec = getDeliveryNotePageSpec(format);
  const doc = new jsPDF({
    orientation: spec.orientation,
    unit: "mm",
    format: spec.format,
    compress: true,
  });

  if (format === DELIVERY_NOTE_FORMATS.MUNBYN_4X3) {
    drawMunbyn4x3(doc, payload);
  } else if (format === DELIVERY_NOTE_FORMATS.MUNBYN_4X6) {
    drawMunbyn4x6(doc, payload);
  } else {
    drawA4(doc, payload);
  }

  const suffix = format === DELIVERY_NOTE_FORMATS.A4
    ? "A4"
    : format === DELIVERY_NOTE_FORMATS.MUNBYN_4X3
      ? "MUNBYN-4x3"
      : "MUNBYN-4x6";
  return {
    doc,
    fileName: `${clean(payload.number, "LAHETYSLISTA")}-${suffix}.pdf`,
  };
}
