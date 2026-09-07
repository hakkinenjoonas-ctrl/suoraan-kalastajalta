import { jsPDF } from "jspdf";

const money = (value) => `${Number(value || 0).toLocaleString("fi-FI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
export const CONSUMER_CUSTOMER_CARD_WIDTH_MM = 101.6;
export const CONSUMER_CUSTOMER_CARD_HEIGHT_MM = 76.2;

export function groupConsumerOrdersForCustomerCards(orders = []) {
  const groups = new Map();
  orders.forEach((order) => {
    const groupId = String(order.reservation_group_id || order.id || "");
    if (!groupId) return;
    if (!groups.has(groupId)) groups.set(groupId, { id: groupId, orders: [] });
    groups.get(groupId).orders.push(order);
  });

  return Array.from(groups.values()).map((group) => {
    const first = group.orders[0] || {};
    const lines = group.orders.map((order) => ({
      id: order.id,
      label: order.variant_label || (order.sale_unit_type === "whole_fish" ? "kokonainen kala" : "pakkaus"),
      unitCount: Number(order.unit_count || order.package_count || 0),
      total: Number(order.total_including_vat || 0),
      priceIsFinal: order.sale_unit_type !== "whole_fish" || Number(order.final_weight_kg || 0) > 0,
    }));
    return {
      id: group.id,
      customerName: first.consumer_name || "Nimi puuttuu",
      customerPhone: first.consumer_phone || "",
      productName: first.product_name || first.species || "Kalaerä",
      pickupLocation: first.pickup_location || "",
      batchId: first.batch_id || "",
      lines,
      total: Number(lines.reduce((sum, line) => sum + line.total, 0).toFixed(2)),
      priceIsFinal: lines.every((line) => line.priceIsFinal),
    };
  });
}

function fitFontSize(doc, text, maximumWidth, startSize, minimumSize = 14) {
  let size = startSize;
  while (size > minimumSize) {
    doc.setFontSize(size);
    if (doc.getTextWidth(String(text || "")) <= maximumWidth) break;
    size -= 1;
  }
  doc.setFontSize(size);
}

export function buildConsumerCustomerCardsPdf(reservations = []) {
  if (reservations.length < 1) throw new Error("Tulostettavia asiakaskortteja ei löytynyt.");
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [CONSUMER_CUSTOMER_CARD_WIDTH_MM, CONSUMER_CUSTOMER_CARD_HEIGHT_MM],
    compress: true,
  });

  reservations.forEach((reservation, index) => {
    if (index > 0) doc.addPage([CONSUMER_CUSTOMER_CARD_WIDTH_MM, CONSUMER_CUSTOMER_CARD_HEIGHT_MM], "landscape");
    doc.setDrawColor(30, 58, 138);
    doc.setLineWidth(0.55);
    doc.roundedRect(2.4, 2.4, 96.8, 71.4, 2.2, 2.2);

    doc.setTextColor(30, 58, 138);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("SUORAAN KALASTAJALTA", 6, 8.5);
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    if (reservation.batchId) doc.text(`Erä ${reservation.batchId}`, 95.5, 8.5, { align: "right" });

    doc.setTextColor(71, 85, 105);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text("ASIAKAS", 6, 15);
    doc.setTextColor(15, 23, 42);
    fitFontSize(doc, reservation.customerName, 89.5, 24, 13);
    doc.text(String(reservation.customerName), 6, 23.5);

    doc.setDrawColor(203, 213, 225);
    doc.line(6, 27.5, 95.5, 27.5);
    doc.line(65, 31, 65, 65.5);
    doc.setTextColor(71, 85, 105);
    doc.setFontSize(7);
    doc.text("TUOTE JA MÄÄRÄ", 6, 33.5);
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    fitFontSize(doc, reservation.productName, 55, 15.5, 10);
    doc.text(String(reservation.productName), 6, 40.5);

    doc.setFont("helvetica", "normal");
    const lineFontSize = reservation.lines.length > 4 ? 7.2 : 9;
    const lineStep = reservation.lines.length > 4 ? 4.4 : 5.3;
    doc.setFontSize(lineFontSize);
    let lineY = 46.5;
    reservation.lines.forEach((line) => {
      const lineText = `${line.unitCount} × ${line.label}`;
      const wrapped = doc.splitTextToSize(lineText, 55);
      doc.text(wrapped, 6, lineY);
      lineY += Math.max(lineStep, wrapped.length * lineStep);
    });

    doc.setTextColor(71, 85, 105);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text("HINTA", 69, 34);
    doc.setTextColor(15, 23, 42);
    if (reservation.priceIsFinal) {
      fitFontSize(doc, money(reservation.total), 26.5, 19, 12);
      doc.text(money(reservation.total), 69, 44);
    } else {
      doc.setFontSize(14);
      doc.text("__________ €", 69, 44);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(71, 85, 105);
      doc.text("Täytetään punnituksen jälkeen", 69, 49);
      doc.text(`Arvio ${money(reservation.total)}`, 69, 53.5);
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(51, 65, 85);
    if (reservation.customerPhone) doc.text(`Puhelin: ${reservation.customerPhone}`, 69, 60);
    doc.setDrawColor(203, 213, 225);
    doc.line(6, 66, 95.5, 66);
    doc.setFontSize(6.5);
    if (reservation.pickupLocation) doc.text(doc.splitTextToSize(`Nouto: ${reservation.pickupLocation}`, 69), 6, 70.5);
    doc.text(`Varaus ${String(reservation.id).slice(0, 8).toUpperCase()}`, 95.5, 70.5, { align: "right" });
  });

  return doc;
}
