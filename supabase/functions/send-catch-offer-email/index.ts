import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

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

function parsePriceFromNotes(notesValue: unknown) {
  const match = safeString(notesValue).match(/Hinta:\s*([0-9]+(?:[.,][0-9]+)?)\s*€/i);
  if (!match) return "";
  const parsed = Number(match[1].replace(",", "."));
  return Number.isNaN(parsed) ? "" : parsed;
}

function formatKilos(value: unknown) {
  const number = Number(value);
  if (Number.isNaN(number)) return safeString(value) || "-";
  return `${number.toLocaleString("fi-FI")} kg`;
}

function getLineItems(entry: Record<string, unknown>) {
  const rawItems = Array.isArray(entry.line_items) ? entry.line_items : [];
  return rawItems
    .map((item) => {
      const row = (item || {}) as Record<string, unknown>;
      const species = safeString(row.species);
      const scientificNames = Array.from(species.matchAll(/\(([^()]+)\)/g)).map((match) => safeString(match[1])).filter(Boolean).join(", ");
      const kilos = formatKilos(row.kilos);
      const price = formatPrice(row.price_per_kg);
      const batchId = safeString(row.batch_id);
      const count = Number(row.count || 0);
      return {
        species,
        scientificNames,
        kilos,
        price,
        batchId,
        count: Number.isFinite(count) && count > 0 ? `${count} kpl` : "",
      };
    })
    .filter((item) => item.species || item.batchId);
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

function getPublicPickupLocation(entry: Record<string, unknown>) {
  const municipality = safeString(entry.municipality);
  if (municipality) return municipality;

  const deliveryArea = safeString(entry.deliveryArea);
  if (deliveryArea) {
    const parts = deliveryArea.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length > 1) return parts[parts.length - 1];
    return deliveryArea;
  }

  return safeString(entry.area) || "-";
}

function describeResendError(data: unknown) {
  if (!data) return "Tuntematon sähköpostivirhe";
  if (typeof data === "string") return data;
  if (typeof data === "object") {
    const candidate = data as Record<string, unknown>;
    if (typeof candidate.message === "string" && candidate.message.trim()) return candidate.message;
    if (typeof candidate.error === "string" && candidate.error.trim()) return candidate.error;
    if (typeof candidate.name === "string" && candidate.name.trim()) return candidate.name;
  }
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

function buildFieldRow(label: string, value: string) {
  return `
    <tr>
      <td style="padding:14px 16px;border:1px solid #cbd5e1;font-weight:700;width:180px;background:#eff6ff;">${escapeHtml(label)}</td>
      <td style="padding:14px 16px;border:1px solid #cbd5e1;">${escapeHtml(value || "-")}</td>
    </tr>
  `;
}

function extractScientificNames(...values: unknown[]) {
  const names = values
    .flatMap((value) =>
      safeString(value)
        .split("\n")
        .flatMap((line) => Array.from(line.matchAll(/\(([^()]+)\)/g)).map((match) => safeString(match[1])))
    )
    .filter(Boolean);

  return Array.from(new Set(names)).join(", ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail =
      Deno.env.get("OFFERS_FROM_EMAIL") ||
      Deno.env.get("FROM_EMAIL") ||
      Deno.env.get("RESEND_FROM_EMAIL") ||
      "Suoraan Kalastajalta <tarjoukset@mail.suoraankalastajalta.fi>";
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(500, { error: "Missing Supabase service credentials" });
    }
    if (!resendApiKey) {
      return jsonResponse(500, { error: "Missing RESEND_API_KEY" });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { entry, recipients } = await req.json();
    if (!entry || !Array.isArray(recipients) || recipients.length === 0) {
      return jsonResponse(400, { error: "Missing entry or recipients" });
    }

    const species = safeString(entry.species || "Kalaerä");
    const kilos = formatKilos(entry.kilos);
    const lineItems = getLineItems(entry as Record<string, unknown>);
    const mixedOffer = lineItems.length > 1;
    const dateLabel = safeString(entry.dateLabel || "Pyyntipäivämäärä");
    const date = safeString(entry.date);
    const area = safeString(entry.area);
    const gear = safeString(entry.gear);
    const price = formatPrice(entry.price_per_kg === null || entry.price_per_kg === undefined || entry.price_per_kg === "" ? parsePriceFromNotes(entry.notes) : entry.price_per_kg);
    const sellerName = "Anonyymi kalastaja";
    const batchId = safeString(entry.batch_id);
    const extraNotes = formatAdditionalNotes(entry.notes);
    const scientificNames = extractScientificNames(entry.species, entry.notes);
    const deliveryMethod = safeString(entry.deliveryMethod || "Nouto");
    const publicDeliveryLocation = deliveryMethod === "Nouto"
      ? getPublicPickupLocation(entry as Record<string, unknown>)
      : safeString(entry.deliveryArea || entry.area || "-");

    const lineItemRows = lineItems
      .map((item) => `
        <tr>
          <td style="padding:14px 16px;border:1px solid #cbd5e1;font-weight:700;background:#eff6ff;">${escapeHtml(item.species || "-")}</td>
          <td style="padding:14px 16px;border:1px solid #cbd5e1;">${escapeHtml(item.scientificNames || "-")}</td>
          <td style="padding:14px 16px;border:1px solid #cbd5e1;">${escapeHtml(item.kilos || "-")}</td>
          <td style="padding:14px 16px;border:1px solid #cbd5e1;">${escapeHtml(item.price || "-")}</td>
          <td style="padding:14px 16px;border:1px solid #cbd5e1;">${escapeHtml(item.batchId || "-")}</td>
        </tr>
      `)
      .join("");

    const subjectSpecies = mixedOffer
      ? lineItems.map((item) => item.species.replace(/\s*\([^()]+\)\s*/g, "").trim()).filter(Boolean).join(", ")
      : species;

    const tableRows = [
      buildFieldRow("Laji / erä", mixedOffer ? "Monilajinen erä" : species),
      scientificNames ? buildFieldRow("Tieteellinen nimi", scientificNames) : "",
      !mixedOffer ? buildFieldRow("Määrä", kilos) : "",
      buildFieldRow(dateLabel, date),
      buildFieldRow("Vesialue", area),
      buildFieldRow(deliveryMethod === "Nouto" ? "Noutopaikka" : "Toimitusalue", publicDeliveryLocation || "-"),
      buildFieldRow("Pyydys", gear || "-"),
      !mixedOffer ? buildFieldRow("Hinta", price) : "",
      batchId && !mixedOffer ? buildFieldRow("Erätunnus", batchId) : "",
      buildFieldRow("Tarjoaja", sellerName),
      extraNotes ? buildFieldRow("Lisätiedot", extraNotes) : "",
    ]
      .filter(Boolean)
      .join("");

    const results = [];

    console.log("send-catch-offer-email:start", {
      recipientCount: recipients.length,
      recipientEmails: recipients.map((recipient: Record<string, unknown>) => safeString(recipient?.email).toLowerCase()).filter(Boolean),
      fromEmail,
      species,
      kilos,
      price,
      batchId,
    });

    for (const recipient of recipients) {
      const recipientEmail = safeString(recipient?.email).toLowerCase();
      if (!recipientEmail) {
        results.push({ ok: false, email: "", error: "Missing recipient email" });
        continue;
      }

      const offerLink = safeString(recipient?.offer_link);
      const subject = mixedOffer
        ? `Uusi kalaerä tarjolla – ${subjectSpecies} yhteensä ${kilos}`
        : `Uusi kalaerä tarjolla – ${species} ${kilos}`;

      const textLines = [
        "Uusi kalaerä tarjolla.",
        "",
        `Laji / erä: ${mixedOffer ? "Monilajinen erä" : species}`,
        scientificNames ? `Tieteellinen nimi: ${scientificNames}` : null,
        !mixedOffer ? `Määrä: ${kilos}` : null,
        `${dateLabel}: ${date || "-"}`,
        `Vesialue: ${area || "-"}`,
        `${deliveryMethod === "Nouto" ? "Noutopaikka" : "Toimitusalue"}: ${publicDeliveryLocation || "-"}`,
        `Pyydys: ${gear || "-"}`,
        !mixedOffer ? `Hinta: ${price}` : null,
        batchId && !mixedOffer ? `Erätunnus: ${batchId}` : null,
        mixedOffer ? "Erän lajit:" : null,
        ...lineItems.map((item) => `- ${item.species}: ${item.scientificNames || "-"} · ${item.kilos} · ${item.price}${item.batchId ? ` · Erätunnus ${item.batchId}` : ""}`),
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
          ${mixedOffer ? `
            <table style="width:100%; border-collapse:collapse; background:#111827; color:#f8fafc; margin-bottom:20px;">
              <thead>
                <tr>
                  <th style="padding:14px 16px;border:1px solid #cbd5e1;background:#1e3a8a;text-align:left;">Kalalaji</th>
                  <th style="padding:14px 16px;border:1px solid #cbd5e1;background:#1e3a8a;text-align:left;">Tieteellinen nimi</th>
                  <th style="padding:14px 16px;border:1px solid #cbd5e1;background:#1e3a8a;text-align:left;">Määrä</th>
                  <th style="padding:14px 16px;border:1px solid #cbd5e1;background:#1e3a8a;text-align:left;">Hinta</th>
                  <th style="padding:14px 16px;border:1px solid #cbd5e1;background:#1e3a8a;text-align:left;">Erätunnus</th>
                </tr>
              </thead>
              <tbody>
                ${lineItemRows}
              </tbody>
            </table>
          ` : ""}
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

      const resendBody = await resendResponse.text();
      let resendData: unknown = resendBody;
      try {
        resendData = resendBody ? JSON.parse(resendBody) : {};
      } catch {
        resendData = resendBody;
      }
      if (!resendResponse.ok) {
        console.error("send-catch-offer-email:resend-error", {
          recipientEmail,
          status: resendResponse.status,
          resendData,
        });
        results.push({
          ok: false,
          email: recipientEmail,
          error: `Resend ${resendResponse.status}: ${describeResendError(resendData)}`,
        });
      } else {
        console.log("send-catch-offer-email:resend-ok", {
          recipientEmail,
          resendData,
        });
        results.push({ ok: true, email: recipientEmail, resend: resendData });
      }
    }

    console.log("send-catch-offer-email:finished", {
      ok: results.every((result) => result.ok),
      results,
    });

    return jsonResponse(200, { ok: results.every((result) => result.ok), results });
  } catch (error) {
    return jsonResponse(500, { error: String(error instanceof Error ? error.message : error) });
  }
});
