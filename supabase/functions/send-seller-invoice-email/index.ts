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
      invoiceNumber,
      referenceNumber,
      sellerName,
      buyerName,
      totalAmount,
      dueDate,
      fileName,
      pdfBase64,
    } = await req.json();

    if (!invoiceEmail || !fileName || !pdfBase64) {
      return jsonResponse(400, { error: "Missing invoiceEmail, fileName or pdfBase64" });
    }

    const safeInvoiceNumber = escapeHtml(invoiceNumber || "Lasku");
    const safeReferenceNumber = escapeHtml(referenceNumber || "");
    const safeSellerName = escapeHtml(sellerName || "Suoraan Kalastajalta");
    const safeBuyerName = escapeHtml(buyerName || "Asiakas");
    const safeTotalAmount = escapeHtml(totalAmount || "");
    const safeDueDate = escapeHtml(dueDate || "");

    const text = [
      `Hei ${buyerName || "Asiakas"},`,
      "",
      `${sellerName || "Suoraan Kalastajalta"} lähetti sinulle laskun PDF-liitteenä.`,
      invoiceNumber ? `Laskunumero: ${invoiceNumber}` : "",
      referenceNumber ? `Viitenumero: ${referenceNumber}` : "",
      totalAmount ? `Maksettava yhteensä: ${totalAmount}` : "",
      dueDate ? `Eräpäivä: ${dueDate}` : "",
      "",
      "Ystävällisin terveisin",
      "Suoraan Kalastajalta",
    ].filter((line) => line !== "").join("\n");

    const html = `
      <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
        <h2 style="color: #1d4ed8; margin-bottom: 12px;">Lasku PDF-liitteenä</h2>
        <p>Hei <strong>${safeBuyerName}</strong>,</p>
        <p><strong>${safeSellerName}</strong> lähetti sinulle laskun PDF-liitteenä.</p>
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
        subject: `${invoiceNumber || "Lasku"} - ${sellerName || "Suoraan Kalastajalta"}`,
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
