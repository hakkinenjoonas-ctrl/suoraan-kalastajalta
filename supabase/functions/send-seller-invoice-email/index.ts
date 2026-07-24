const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function escapeHtml(value: unknown) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail =
      Deno.env.get("OFFERS_FROM_EMAIL") ||
      Deno.env.get("FROM_EMAIL") ||
      Deno.env.get("RESEND_FROM_EMAIL") ||
      "Suoraan Kalastajalta <tarjoukset@mail.suoraankalastajalta.fi>";

    if (!resendApiKey) {
      return jsonResponse(500, { error: "Missing RESEND_API_KEY" });
    }

    const {
      invoiceEmail,
      recipientName,
      invoiceNumber,
      referenceNumber,
      sellerName,
      buyerName,
      totalAmount,
      dueDate,
      documentKind,
      fileName,
      pdfBase64,
      emailMode,
    } = await req.json();

    if (!invoiceEmail || !fileName || !pdfBase64) {
      return jsonResponse(400, { error: "Missing invoiceEmail, fileName or pdfBase64" });
    }

    const safeInvoiceNumber = escapeHtml(invoiceNumber || "Lasku");
    const safeReferenceNumber = escapeHtml(referenceNumber || "");
    const safeSellerName = escapeHtml(sellerName || "Suoraan Kalastajalta");
    const safeRecipientName = escapeHtml(recipientName || buyerName || "Vastaanottaja");
    const copyTargetText = buyerName ? `yritykselle ${buyerName}` : "asiakkaalle";
    const safeCopyTargetText = buyerName ? `yritykselle <strong>${escapeHtml(buyerName)}</strong>` : "asiakkaalle";
    const safeTotalAmount = escapeHtml(totalAmount || "");
    const safeDueDate = escapeHtml(dueDate || "");
    const isReminder = documentKind === "reminder";
    const isCopy = emailMode === "copy";
    const documentLabel = isReminder ? "Maksumuistutus" : "Lasku";
    const subjectDocumentLabel = isReminder ? "MAKSUMUISTUTUS" : documentLabel;
    const introText = isCopy
      ? `Tässä on kopio lähettämästäsi ${isReminder ? "maksumuistutuksesta" : "laskusta"} ${copyTargetText}. ${documentLabel} on PDF-liitteenä.`
      : isReminder
        ? `${sellerName || "Suoraan Kalastajalta"} lähetti sinulle maksumuistutuksen PDF-liitteenä.`
        : `${sellerName || "Suoraan Kalastajalta"} lähetti sinulle laskun PDF-liitteenä.`;
    const copyIntroHtml = `Tässä on kopio lähettämästäsi ${isReminder ? "maksumuistutuksesta" : "laskusta"} ${safeCopyTargetText}. ${escapeHtml(documentLabel)} on PDF-liitteenä.`;

    const text = [
      `Hei ${recipientName || buyerName || "Vastaanottaja"},`,
      "",
      introText,
      invoiceNumber ? `Laskunumero: ${invoiceNumber}` : "",
      referenceNumber ? `Viitenumero: ${referenceNumber}` : "",
      totalAmount ? `Maksettava yhteensä: ${totalAmount}` : "",
      dueDate ? `Eräpäivä: ${dueDate}` : "",
      isReminder ? "Huomio: tämä viesti on maksumuistutus." : "",
      "",
      "Ystävällisin terveisin",
      "Suoraan Kalastajalta",
    ].filter((line) => line !== "").join("\n");

    const html = `
      <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
        <h2 style="color: #1d4ed8; margin-bottom: 12px;">${escapeHtml(documentLabel)}${isCopy ? " - kopio" : ""} PDF-liitteenä</h2>
        <p>Hei <strong>${safeRecipientName}</strong>,</p>
        <p>${isCopy ? copyIntroHtml : `<strong>${safeSellerName}</strong> lähetti sinulle ${isReminder ? "maksumuistutuksen" : "laskun"} PDF-liitteenä.`}</p>
        ${isReminder ? `<p><strong>Huomio:</strong> tämä viesti on maksumuistutus.</p>` : ""}
        <table style="border-collapse: collapse; width: 100%; max-width: 520px;">
          ${safeInvoiceNumber ? `<tr><td style="padding: 8px 10px; background: #eff6ff; border: 1px solid #bfdbfe; font-weight: 700;">Laskunumero</td><td style="padding: 8px 10px; border: 1px solid #bfdbfe;">${safeInvoiceNumber}</td></tr>` : ""}
          ${safeReferenceNumber ? `<tr><td style="padding: 8px 10px; background: #eff6ff; border: 1px solid #bfdbfe; font-weight: 700;">Viitenumero</td><td style="padding: 8px 10px; border: 1px solid #bfdbfe;">${safeReferenceNumber}</td></tr>` : ""}
          ${safeTotalAmount ? `<tr><td style="padding: 8px 10px; background: #eff6ff; border: 1px solid #bfdbfe; font-weight: 700;">Maksettava</td><td style="padding: 8px 10px; border: 1px solid #bfdbfe;">${safeTotalAmount}</td></tr>` : ""}
          ${safeDueDate ? `<tr><td style="padding: 8px 10px; background: #eff6ff; border: 1px solid #bfdbfe; font-weight: 700;">Eräpäivä</td><td style="padding: 8px 10px; border: 1px solid #bfdbfe;">${safeDueDate}</td></tr>` : ""}
        </table>
        <p style="margin-top: 16px;">Ystävällisin terveisin<br />Suoraan Kalastajalta</p>
      </div>
    `;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [invoiceEmail],
        subject: `${subjectDocumentLabel}${invoiceNumber ? ` ${invoiceNumber}` : ""}${isCopy ? " - kopio" : ""} - ${sellerName || "Suoraan Kalastajalta"}`,
        text,
        html,
        attachments: [
          {
            filename: String(fileName),
            content: String(pdfBase64),
          },
        ],
      }),
    });

    const resendData = await resendResponse.json();
    if (!resendResponse.ok) {
      return jsonResponse(500, { error: resendData });
    }

    return jsonResponse(200, { ok: true, resend: resendData });
  } catch (error) {
    return jsonResponse(500, { error: String(error instanceof Error ? error.message : error) });
  }
});
