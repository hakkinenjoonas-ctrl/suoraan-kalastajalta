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

function buildDeliveryAddress(offer: Record<string, unknown>) {
  return [
    String(offer.buyer_delivery_address || "").trim(),
    String(offer.buyer_delivery_postcode || "").trim(),
    String(offer.buyer_delivery_city || "").trim(),
  ]
    .filter(Boolean)
    .join(", ");
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

    const { buyerEmail, offerLink, offer } = await req.json();
    if (!buyerEmail || !offer) {
      return jsonResponse(400, { error: "Missing buyerEmail or offer" });
    }

    const sellerName = String(offer.sellerName || "Myyja");
    const speciesSummary = String(offer.species_summary || "Kalaera");
    const area = String(offer.area || "-");
    const spot = String(offer.spot || "");
    const kilos = String(offer.accepted_kilos || offer.reserved_kilos || offer.total_kilos || "-");
    const pricePerKg = offer.counter_price_per_kg == null || offer.counter_price_per_kg === ""
      ? "-"
      : `${offer.counter_price_per_kg} EUR/kg`;
    const tradeValue = String(offer.trade_value || "-");
    const batchId = String(offer.batch_id || "").trim();
    const qrImageUrl = String(offer.qr_image_url || "").trim();
    const deliveryAddress = buildDeliveryAddress(offer);
    const billingEmail = String(offer.buyer_billing_email || "").trim();

    const textLines = [
      "Kauppa hyväksytty.",
      "",
      `${sellerName} on hyväksynyt tarjouksesi tai varauksesi.`,
      "",
      `Erä: ${speciesSummary}`,
      `Määrä: ${kilos} kg`,
      batchId ? `Erätunnus: ${batchId}` : null,
      `Alue: ${area}${spot ? ` / ${spot}` : ""}`,
      `Hinta: ${pricePerKg}`,
      `Kaupan arvo: ${tradeValue}`,
      deliveryAddress ? `Toimitusosoite: ${deliveryAddress}` : null,
      billingEmail ? `Laskutussähköposti: ${billingEmail}` : null,
      offerLink ? `Katso tarkemmat tiedot: ${offerLink}` : null,
    ].filter(Boolean);

    const html = `
      <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5;">
        <h2 style="color: #166534;">Kauppa hyväksytty</h2>
        <p><strong>${sellerName}</strong> on hyväksynyt tarjouksesi tai varauksesi.</p>
        <p><strong>Erä:</strong><br />${speciesSummary.replaceAll("\n", "<br />")}</p>
        <p>
          <strong>Määrä:</strong> ${kilos} kg<br />
          ${batchId ? `<strong>Erätunnus:</strong> ${batchId}<br />` : ""}
          <strong>Alue:</strong> ${area}${spot ? ` / ${spot}` : ""}<br />
          <strong>Hinta:</strong> ${pricePerKg}<br />
          <strong>Kaupan arvo:</strong> ${tradeValue}
        </p>
        ${qrImageUrl ? `<p><strong>QR-koodi erälle</strong><br /><img src="${qrImageUrl}" alt="QR ${batchId || "era"}" style="width:160px;height:160px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;padding:8px;" /></p>` : ""}
        ${deliveryAddress ? `<p><strong>Toimitusosoite:</strong> ${deliveryAddress}</p>` : ""}
        ${billingEmail ? `<p><strong>Laskutussähköposti:</strong> ${billingEmail}</p>` : ""}
        ${offerLink ? `<p><a href="${offerLink}" style="display:inline-block;padding:10px 14px;background:#166534;color:#fff;text-decoration:none;border-radius:8px;">Avaa kaupan tiedot</a></p>` : ""}
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
        to: [buyerEmail],
        subject: "Kauppa hyväksytty",
        text: textLines.join("\n"),
        html,
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
