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

function buildBillingAddress(offer: Record<string, unknown>) {
  return [
    String(offer.buyer_billing_address || "").trim(),
    String(offer.buyer_billing_postcode || "").trim(),
    String(offer.buyer_billing_city || "").trim(),
  ]
    .filter(Boolean)
    .join(", ");
}

function fulfillmentStatusLabel(status: unknown) {
  if (status === "delivery_agreed") return "Toimitus sovittu";
  if (status === "delivered") return "Toimitettu";
  return "Yhteydenotto kesken";
}

function extractScientificNames(...values: unknown[]) {
  const names = values
    .flatMap((value) =>
      String(value || "")
        .split("\n")
        .flatMap((line) => Array.from(line.matchAll(/\(([^()]+)\)/g)).map((match) => String(match[1] || "").trim()))
    )
    .filter(Boolean);

  return Array.from(new Set(names)).join(", ");
}

function isCrayfishOffer(...values: unknown[]) {
  const haystack = values.map((value) => String(value || "").toLowerCase()).join(" ");
  return haystack.includes("täplärapu") ||
    haystack.includes("jokirapu") ||
    haystack.includes("pacifastacus leniusculus") ||
    haystack.includes("astacus astacus");
}

function extractCatchDates(value: unknown) {
  const matches = Array.from(String(value || "").matchAll(/Pyyntipäivämäärä\s+([0-9]{4}-[0-9]{2}-[0-9]{2})/g))
    .map((match) => String(match[1] || "").trim())
    .filter(Boolean);
  return Array.from(new Set(matches)).join(", ");
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
    const sellerEmail = String(offer.sellerEmail || "").trim();
    const sellerCommercialFishingId = String(offer.sellerCommercialFishingId || "").trim();
    const speciesSummary = String(offer.species_summary || "Kalaera");
    const priceUnit = isCrayfishOffer(speciesSummary) ? "EUR/kpl" : "EUR/kg";
    const scientificNames = extractScientificNames(speciesSummary);
    const catchDates = extractCatchDates(speciesSummary);
    const area = String(offer.area || "-");
    const spot = String(offer.spot || "");
    const deliveryMethod = String(offer.delivery_method || "").trim();
    const deliveryArea = String(offer.delivery_area || "").trim();
    const deliveryCost = offer.delivery_cost == null || offer.delivery_cost === "" ? "-" : `${offer.delivery_cost} €`;
    const earliestDeliveryDate = String(offer.earliest_delivery_date || "").trim();
    const coldTransport = offer.cold_transport ? "Kyllä" : "Ei";
    const kilos = String(offer.accepted_kilos || offer.reserved_kilos || offer.total_kilos || "-");
    const pricePerKg = offer.counter_price_per_kg == null || offer.counter_price_per_kg === ""
      ? "-"
      : `${offer.counter_price_per_kg} ${priceUnit}`;
    const tradeValue = String(offer.trade_value || "-");
    const batchId = String(offer.batch_id || "").trim();
    const qrImageUrl = String(offer.qr_image_url || "").trim();
    const deliveryAddress = buildDeliveryAddress(offer);
    const billingAddress = buildBillingAddress(offer);
    const billingEmail = String(offer.buyer_billing_email || "").trim();
    const fulfillmentStatus = fulfillmentStatusLabel(offer.fulfillment_status);

    const textLines = [
      "Kauppa hyväksytty.",
      "",
      `${sellerName} on hyväksynyt tarjouksesi tai varauksesi.`,
      "",
      `Erä: ${speciesSummary}`,
      scientificNames ? `Tieteellinen nimi: ${scientificNames}` : null,
      catchDates ? `Pyyntipäivämäärä: ${catchDates}` : null,
      `Määrä: ${kilos} kg`,
      batchId ? `Erätunnus: ${batchId}` : null,
      `Alue: ${area}${spot ? ` / ${spot}` : ""}`,
      sellerEmail ? `Kalastajan sähköposti: ${sellerEmail}` : null,
      sellerCommercialFishingId ? `Kaupallisen kalastajan tunnus: ${sellerCommercialFishingId}` : null,
      `Toimituksen tila: ${fulfillmentStatus}`,
      deliveryMethod ? `Toimitustapa: ${deliveryMethod}` : null,
      deliveryArea ? `${deliveryMethod === "Nouto" ? "Nouto-osoite" : "Toimitusalue"}: ${deliveryArea}` : null,
      `Toimituskulu: ${deliveryCost}`,
      `Aikaisin toimitus: ${earliestDeliveryDate || "-"}`,
      `Kylmäkuljetus: ${coldTransport}`,
      `Hinta: ${pricePerKg}`,
      `Kaupan arvo: ${tradeValue}`,
      deliveryAddress ? `Toimitusosoite: ${deliveryAddress}` : null,
      billingAddress ? `Laskutusosoite: ${billingAddress}` : null,
      billingEmail ? `Laskutussähköposti: ${billingEmail}` : null,
      offerLink ? `Katso tarkemmat tiedot: ${offerLink}` : null,
    ].filter(Boolean);

    const html = `
      <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5;">
        <h2 style="color: #166534;">Kauppa hyväksytty</h2>
        <p><strong>${sellerName}</strong> on hyväksynyt tarjouksesi tai varauksesi.</p>
        <p><strong>Erä:</strong><br />${speciesSummary.replaceAll("\n", "<br />")}</p>
        ${scientificNames ? `<p><strong>Tieteellinen nimi:</strong><br />${scientificNames}</p>` : ""}
        ${catchDates ? `<p><strong>Pyyntipäivämäärä:</strong><br />${catchDates}</p>` : ""}
        <p>
          <strong>Määrä:</strong> ${kilos} kg<br />
          ${batchId ? `<strong>Erätunnus:</strong> ${batchId}<br />` : ""}
          <strong>Alue:</strong> ${area}${spot ? ` / ${spot}` : ""}<br />
          ${sellerEmail ? `<strong>Kalastajan sähköposti:</strong> ${sellerEmail}<br />` : ""}
          ${sellerCommercialFishingId ? `<strong>Kaupallisen kalastajan tunnus:</strong> ${sellerCommercialFishingId}<br />` : ""}
          <strong>Toimituksen tila:</strong> ${fulfillmentStatus}<br />
          ${deliveryMethod ? `<strong>Toimitustapa:</strong> ${deliveryMethod}<br />` : ""}
          ${deliveryArea ? `<strong>${deliveryMethod === "Nouto" ? "Nouto-osoite" : "Toimitusalue"}:</strong> ${deliveryArea}<br />` : ""}
          <strong>Toimituskulu:</strong> ${deliveryCost}<br />
          <strong>Aikaisin toimitus:</strong> ${earliestDeliveryDate || "-"}<br />
          <strong>Kylmäkuljetus:</strong> ${coldTransport}<br />
          <strong>Hinta:</strong> ${pricePerKg}<br />
          <strong>Kaupan arvo:</strong> ${tradeValue}
        </p>
        ${qrImageUrl ? `<p><strong>QR-koodi erälle</strong><br /><img src="${qrImageUrl}" alt="QR ${batchId || "era"}" style="width:160px;height:160px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;padding:8px;" /></p>` : ""}
        ${deliveryAddress ? `<p><strong>Toimitusosoite:</strong> ${deliveryAddress}</p>` : ""}
        ${billingAddress ? `<p><strong>Laskutusosoite:</strong> ${billingAddress}</p>` : ""}
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
