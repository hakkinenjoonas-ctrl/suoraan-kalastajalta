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

function safeString(value: unknown) {
  return String(value || "").trim();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatPrice(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  const number = Number(value);
  if (Number.isNaN(number)) return safeString(value);
  return `${number.toLocaleString("fi-FI")} €/kg`;
}

function formatKilos(value: unknown) {
  const number = Number(value);
  if (Number.isNaN(number)) return safeString(value) || "-";
  return `${number.toLocaleString("fi-FI")} kg`;
}

function formatAdditionalNotes(notesValue: unknown) {
  const lines = safeString(notesValue)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return "";

  const cleaned = [];
  let inSpeciesBlock = false;
  for (const line of lines) {
    if (line === "Erän lajit:") {
      inSpeciesBlock = true;
      continue;
    }
    if (line === "Toimitus:") {
      inSpeciesBlock = false;
      continue;
    }
    if (inSpeciesBlock) continue;
    if (line.startsWith("Hinta:")) continue;
    cleaned.push(line);
  }

  return cleaned.join("\n");
}

function buildFieldRow(label: string, value: string) {
  return `
    <tr>
      <td style="padding:14px 16px;border:1px solid #cbd5e1;font-weight:700;width:180px;background:#eff6ff;">${escapeHtml(label)}</td>
      <td style="padding:14px 16px;border:1px solid #cbd5e1;">${escapeHtml(value || "-")}</td>
    </tr>
  `;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("FROM_EMAIL") || "Suoraan Kalastajalta <noreply@suoraankalastajalta.fi>";
    if (!resendApiKey) {
      return jsonResponse(500, { error: "Missing RESEND_API_KEY" });
    }

    const { entry, recipients } = await req.json();
    if (!entry || !Array.isArray(recipients) || recipients.length === 0) {
      return jsonResponse(400, { error: "Missing entry or recipients" });
    }

    const species = safeString(entry.species || "Kalaerä");
    const kilos = formatKilos(entry.kilos);
    const dateLabel = safeString(entry.dateLabel || "Pyyntipäivämäärä");
    const date = safeString(entry.date);
    const area = safeString(entry.area);
    const spot = safeString(entry.spot);
    const gear = safeString(entry.gear);
    const price = formatPrice(entry.price_per_kg);
    const sellerName = safeString(entry.ownerName || "Tarjoaja");
    const batchId = safeString(entry.batch_id);
    const extraNotes = formatAdditionalNotes(entry.notes);

    const tableRows = [
      buildFieldRow("Laji / erä", species),
      buildFieldRow("Määrä", kilos),
      buildFieldRow(dateLabel, date),
      buildFieldRow("Vesialue", area),
      buildFieldRow("Pyyntipaikka", spot || "-"),
      buildFieldRow("Pyydys", gear || "-"),
      buildFieldRow("Hinta", price),
      batchId ? buildFieldRow("Erätunnus", batchId) : "",
      buildFieldRow("Tarjoaja", sellerName),
      extraNotes ? buildFieldRow("Lisätiedot", extraNotes) : "",
    ]
      .filter(Boolean)
      .join("");

    const results = [];

    for (const recipient of recipients) {
      const recipientEmail = safeString(recipient?.email).toLowerCase();
      if (!recipientEmail) {
        results.push({ ok: false, email: "", error: "Missing recipient email" });
        continue;
      }

      const offerLink = safeString(recipient?.offer_link);
      const subject = `Uusi kalaerä tarjolla – ${species} ${kilos}`;

      const textLines = [
        "Uusi kalaerä tarjolla.",
        "",
        `Laji / erä: ${species}`,
        `Määrä: ${kilos}`,
        `${dateLabel}: ${date || "-"}`,
        `Vesialue: ${area || "-"}`,
        `Pyyntipaikka: ${spot || "-"}`,
        `Pyydys: ${gear || "-"}`,
        `Hinta: ${price}`,
        batchId ? `Erätunnus: ${batchId}` : null,
        `Tarjoaja: ${sellerName}`,
        extraNotes ? `Lisätiedot: ${extraNotes}` : null,
        offerLink ? `Avaa tarjous apissa: ${offerLink}` : null,
      ].filter(Boolean);

      const html = `
        <div style="font-family: Arial, sans-serif; background:#111827; color:#f8fafc; padding:24px;">
          <h1 style="font-size:20px; margin:0 0 20px;">Uusi kalaerä tarjolla</h1>
          <p style="font-size:16px; line-height:1.6; margin:0 0 20px;">
            Sinulle on lähetetty uusi kalaerätarjous palvelussa <strong>Suoraan Kalastajalta</strong>.
          </p>
          <table style="width:100%; border-collapse:collapse; background:#111827; color:#f8fafc; margin-bottom:20px;">
            ${tableRows}
          </table>
          ${offerLink ? `<p style="margin:0;"><a href="${escapeHtml(offerLink)}" style="display:inline-block;padding:12px 18px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:700;">Avaa tarjous apissa</a></p>` : ""}
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
          to: [recipientEmail],
          subject,
          text: textLines.join("\n"),
          html,
        }),
      });

      const resendData = await resendResponse.json();
      if (!resendResponse.ok) {
        results.push({ ok: false, email: recipientEmail, error: resendData });
      } else {
        results.push({ ok: true, email: recipientEmail, resend: resendData });
      }
    }

    return jsonResponse(200, { ok: results.every((result) => result.ok), results });
  } catch (error) {
    return jsonResponse(500, { error: String(error instanceof Error ? error.message : error) });
  }
});
