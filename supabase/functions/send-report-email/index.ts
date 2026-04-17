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
      toEmail,
      fileName,
      fileBase64,
      reportLabel,
      dateRangeLabel,
    } = await req.json();

    if (!toEmail || !fileName || !fileBase64 || !reportLabel) {
      return jsonResponse(400, {
        error: "Missing toEmail, fileName, fileBase64 or reportLabel",
      });
    }

    const safeReportLabel = escapeHtml(reportLabel);
    const safeDateRangeLabel = escapeHtml(dateRangeLabel || "kaikki");

    const text = [
      `Hei,`,
      "",
      `${reportLabel} on liitetty tähän viestiin Excel-tiedostona.`,
      `Aikaväli: ${dateRangeLabel || "kaikki"}`,
      "",
      "Ystävällisin terveisin",
      "Suoraan Kalastajalta",
    ].join("\n");

    const html = `
      <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
        <h2 style="color: #1d4ed8; margin-bottom: 12px;">${safeReportLabel}</h2>
        <p>Raportti on liitetty tähän viestiin Excel-tiedostona.</p>
        <p><strong>Aikaväli:</strong> ${safeDateRangeLabel}</p>
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
        to: [String(toEmail)],
        subject: `${reportLabel} (${dateRangeLabel || "kaikki"})`,
        text,
        html,
        attachments: [
          {
            filename: String(fileName),
            content: String(fileBase64),
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
