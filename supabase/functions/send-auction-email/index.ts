import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const text = (value: unknown) => String(value ?? "").trim();
const htmlEscape = (value: unknown) => text(value)
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
const money = (value: unknown) =>
  Number(value || 0).toLocaleString("fi-FI", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const number = (value: unknown) =>
  Number(value || 0).toLocaleString("fi-FI", { maximumFractionDigits: 3 });
const date = (value: unknown, withTime = false) => {
  if (!value) return "";
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return text(value);
  return new Intl.DateTimeFormat("fi-FI", {
    ...(withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" }),
    timeZone: "Europe/Helsinki",
  }).format(parsed);
};

type Recipient = {
  key: string;
  email: string;
  subject: string;
  heading: string;
  intro: string;
  event: "auction_opened" | "auction_sold" | "auction_unsold";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });

  try {
    const supabaseUrl = text(Deno.env.get("SUPABASE_URL"));
    const serviceKey = text(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    const resendKey = text(Deno.env.get("RESEND_API_KEY"));
    const from = text(
      Deno.env.get("OFFERS_FROM_EMAIL") ||
      Deno.env.get("FROM_EMAIL") ||
      Deno.env.get("RESEND_FROM_EMAIL"),
    );
    if (!supabaseUrl || !serviceKey || !resendKey || !from) {
      return reply(500, { error: "Email environment variables missing" });
    }

    const body = await req.json().catch(() => ({}));
    const auctionId = text(body.auctionId);
    const requestedEvent = text(body.eventType);
    if (!auctionId || !["auction_opened", "auction_completed"].includes(requestedEvent)) {
      return reply(400, { error: "Invalid auction event" });
    }

    const db = createClient(supabaseUrl, serviceKey);
    const { data: auction, error: auctionError } = await db
      .from("auctions").select("*").eq("id", auctionId).maybeSingle();
    if (auctionError || !auction) return reply(404, { error: "Auction not found" });

    if (requestedEvent === "auction_opened" && !["open", "scheduled"].includes(auction.status)) {
      return reply(200, { sent: 0, skipped: "Auction is no longer open" });
    }
    if (requestedEvent === "auction_completed" && !["sold", "unsold", "cancelled"].includes(auction.status)) {
      return reply(200, { sent: 0, skipped: "Auction is not complete" });
    }

    const unit = text(auction.quantity_unit) || "kg";
    const quantity = auction.total_quantity ?? auction.total_kilos;
    const lot = `${text(auction.species) || "Kalaerä"} · ${number(quantity)} ${unit}`;
    const recipients: Recipient[] = [];

    if (requestedEvent === "auction_opened") {
      // Image is attached immediately after auction creation by the client.
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const { data: buyers, error } = await db.from("buyers")
        .select("id,email,is_active,auction_email_enabled")
        .eq("is_active", true).eq("auction_email_enabled", true);
      if (error) throw error;
      for (const buyer of buyers || []) {
        if (!text(buyer.email)) continue;
        const { data: eligible } = await db.rpc("auction_buyer_is_eligible", {
          p_auction_id: auction.id,
          p_buyer_id: buyer.id,
        });
        if (eligible) recipients.push({
          key: `buyer:${buyer.id}`,
          email: text(buyer.email).toLowerCase(),
          event: "auction_opened",
          subject: `Uusi kalahuutokauppa: ${lot}`,
          heading: "Uusi kalahuutokauppa on alkanut",
          intro: "Sinulle sopiva kalaerä on nyt huutokaupattavana.",
        });
      }
    } else {
      const event = auction.status === "sold" ? "auction_sold" : "auction_unsold";
      const { data: seller } = await db.from("profiles")
        .select("id,email,contact_email").eq("id", auction.seller_user_id).maybeSingle();
      const sellerEmail = text(seller?.contact_email || seller?.email).toLowerCase();
      if (sellerEmail) recipients.push({
        key: `seller:${auction.seller_user_id}`,
        email: sellerEmail,
        event,
        subject: auction.status === "sold"
          ? `Huutokauppa päättyi kauppaan: ${lot}`
          : `Huutokauppa päättyi ilman kauppaa: ${lot}`,
        heading: auction.status === "sold"
          ? "Huutokauppa päättyi kauppaan"
          : auction.status === "cancelled" ? "Huutokauppa peruttiin" : "Huutokauppa päättyi ilman kauppaa",
        intro: auction.status === "sold"
          ? "Erä myytiin onnistuneesti."
          : auction.status === "cancelled" ? "Huutokauppa peruttiin, eikä kauppaa syntynyt." : "Huutokauppa päättyi ilman kauppaa.",
      });

      let bidderId = auction.winning_buyer_id;
      if (!bidderId && auction.highest_bid_id) {
        const { data: highestBid } = await db.from("auction_bids")
          .select("buyer_id").eq("id", auction.highest_bid_id).maybeSingle();
        bidderId = highestBid?.buyer_id;
      }
      if (bidderId) {
        const { data: buyer } = await db.from("buyers")
          .select("id,email,auction_email_enabled").eq("id", bidderId).maybeSingle();
        if (buyer?.auction_email_enabled !== false && text(buyer?.email)) {
          const won = auction.status === "sold" && auction.winning_buyer_id === buyer.id;
          recipients.push({
            key: `buyer:${buyer.id}`,
            email: text(buyer.email).toLowerCase(),
            event: won ? "auction_sold" : "auction_unsold",
            subject: won ? `Voitit kalahuutokaupan: ${lot}` : `Huutokauppa päättyi: ${lot}`,
            heading: won
              ? "Voitit kalahuutokaupan"
              : auction.status === "cancelled" ? "Huutokauppa peruttiin" : "Pohjahinta ei ylittynyt",
            intro: won
              ? `Voitit erän hinnalla ${money(auction.current_price_per_kg)} €/${unit}.`
              : auction.status === "cancelled"
                ? "Huutokauppa peruttiin, eikä kauppaa syntynyt."
                : "Huutosi oli korkein, mutta myyjän asettama pohjahinta ei ylittynyt, joten kauppaa ei syntynyt.",
          });
        }
      }
    }

    const refreshed = await db.from("auctions").select("image_path").eq("id", auction.id).maybeSingle();
    const imagePath = text(refreshed.data?.image_path || auction.image_path);
    const imageUrl = imagePath
      ? `${supabaseUrl}/storage/v1/object/public/auction-images/${imagePath.split("/").map(encodeURIComponent).join("/")}`
      : "";
    const delivery = text(auction.delivery_method || auction.transport_mode) || "Sovitaan myyjän kanssa";
    const destinations = Array.isArray(auction.delivery_destinations)
      ? auction.delivery_destinations.map((item: unknown) =>
        typeof item === "string" ? item : text((item as Record<string, unknown>)?.city || (item as Record<string, unknown>)?.label)
      ).filter(Boolean).join(", ")
      : "";
    const appUrl = `https://suoraan-kalastajalta.vercel.app/?route=auctions&batchId=${encodeURIComponent(text(auction.batch_id))}`;

    let sent = 0;
    for (const recipient of recipients) {
      const { error: claimError } = await db.from("auction_email_deliveries").insert({
        auction_id: auction.id,
        event_type: recipient.event,
        recipient_key: recipient.key,
        recipient_email: recipient.email,
      });
      if (claimError?.code === "23505") continue;
      if (claimError) throw claimError;

      const details = [
        ["Erä", lot],
        ["Erätunnus", text(auction.batch_id)],
        ["Päättymisaika", date(auction.effective_end_at, true)],
        ["Toimitus", [delivery, destinations].filter(Boolean).join(" · ")],
        ["Aikaisin toimituspäivä", date(auction.earliest_delivery_date)],
        ["Toimitushinta", auction.delivery_cost != null ? `${money(auction.delivery_cost)} €` : ""],
        ["Lisätiedot", text(auction.notes)],
      ].filter(([, value]) => value);
      const isSoldSellerMessage = recipient.event === "auction_sold" && recipient.key.startsWith("seller:");
      const soldPrice = `${money(auction.current_price_per_kg)} €/${unit}`;
      const sellerSaleSummaryHtml = isSoldSellerMessage
        ? `<div style="margin:20px 0;padding:20px 22px;border:2px solid #1467e8;border-radius:14px;background:#eff6ff;text-align:center">
            <div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#1e40af">Erän myyntihinta</div>
            <div style="margin-top:6px;font-size:34px;line-height:1.15;font-weight:800;color:#0f172a">${htmlEscape(soldPrice)}</div>
          </div>
          <p style="margin:18px 0;font-size:17px;line-height:1.5;font-weight:700;color:#12213c">Ostajan tiedot löytyvät sovelluksesta.</p>`
        : "";
      const sellerSaleSummaryPlain = isSoldSellerMessage
        ? `\n\nERÄN MYYNTIHINTA: ${soldPrice}\n\nOstajan tiedot löytyvät sovelluksesta.`
        : "";
      const html = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#12213c">
        <h1 style="font-size:24px">${htmlEscape(recipient.heading)}</h1>
        <p>${htmlEscape(recipient.intro)}</p>
        ${sellerSaleSummaryHtml}
        ${imageUrl ? `<img src="${htmlEscape(imageUrl)}" alt="Huutokauppaerä" style="width:100%;max-height:360px;object-fit:cover;border-radius:12px">` : ""}
        <table style="width:100%;border-collapse:collapse;margin:20px 0">${details.map(([label, value]) =>
          `<tr><th style="text-align:left;padding:7px;border-bottom:1px solid #ddd">${htmlEscape(label)}</th><td style="padding:7px;border-bottom:1px solid #ddd">${htmlEscape(value)}</td></tr>`
        ).join("")}</table>
        <p><a href="${htmlEscape(appUrl)}" style="display:inline-block;background:#1467e8;color:white;padding:12px 18px;border-radius:9px;text-decoration:none">Avaa huutokaupat</a></p>
        <p style="font-size:12px;color:#667085">Tämä on huutokauppaan liittyvä palveluviesti.</p>
      </div>`;
      const plain = `${recipient.heading}\n\n${recipient.intro}${sellerSaleSummaryPlain}\n\n${details.map(([a, b]) => `${a}: ${b}`).join("\n")}\n\n${appUrl}`;
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [recipient.email], subject: recipient.subject, html, text: plain }),
      });
      if (!response.ok) {
        await db.from("auction_email_deliveries").delete()
          .eq("auction_id", auction.id).eq("event_type", recipient.event).eq("recipient_key", recipient.key);
        console.error("Auction email failed", recipient.email, await response.text());
        continue;
      }
      sent += 1;
    }

    return reply(200, { sent, recipients: recipients.length });
  } catch (error) {
    console.error("send-auction-email", error);
    return reply(500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});
