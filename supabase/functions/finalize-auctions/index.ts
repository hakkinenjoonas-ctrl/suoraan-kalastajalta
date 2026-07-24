import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function text(value: unknown) {
  return String(value || "").trim();
}

function price(value: unknown) {
  return Number(value || 0).toLocaleString("fi-FI", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function sendPush(supabaseUrl: string, anonKey: string, serviceRoleKey: string, payload: Record<string, unknown>) {
  const result = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify(payload),
  });
  return { ok: result.ok, status: result.status, body: await result.json().catch(() => ({})) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response(405, { error: "Method not allowed" });

  const supabaseUrl = text(Deno.env.get("SUPABASE_URL"));
  const anonKey = text(Deno.env.get("SUPABASE_ANON_KEY"));
  const serviceRoleKey = text(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const authHeader = req.headers.get("Authorization") || "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return response(500, { error: "Supabase environment variables missing" });
  if (!authHeader) return response(401, { error: "Authentication required" });

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return response(401, { error: "Invalid session" });

  const { data: finalizedCount, error: finalizeError } = await userClient.rpc("finalize_due_auctions");
  if (finalizeError) return response(500, { error: finalizeError.message });

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: events, error: claimError } = await admin.rpc("claim_auction_completion_notifications");
  if (claimError) return response(500, { error: claimError.message });

  const results: Array<{ ok: boolean; status: number; body: unknown }> = [];
  for (const event of events || []) {
    const species = text(event.species) || "Kalaerä";
    const kilos = Number(event.total_kilos || 0).toLocaleString("fi-FI");
    const batchId = text(event.batch_id);
    const routeData = { route: "auctions", offerId: text(event.resulting_buyer_offer_id), batchId };

    const sellerPayload = event.auction_status === "sold"
      ? {
          targetUserId: text(event.seller_user_id),
          title: "Huutokauppa päättyi kauppaan",
          body: `${species} · ${kilos} kg myytiin hintaan ${price(event.final_price_per_kg)} €/kg.`,
          eventType: "auction_sold",
          data: routeData,
        }
      : {
          targetUserId: text(event.seller_user_id),
          title: "Huutokauppa päättyi",
          body: `${species} · ${kilos} kg jäi myymättä${event.auction_status === "cancelled" ? " tai huutokauppa peruttiin" : ""}.`,
          eventType: "auction_unsold",
          data: routeData,
        };
    results.push(await sendPush(supabaseUrl, anonKey, serviceRoleKey, sellerPayload));

    if (event.auction_status === "sold" && event.winning_buyer_id) {
      results.push(await sendPush(supabaseUrl, anonKey, serviceRoleKey, {
        targetBuyerId: text(event.winning_buyer_id),
        title: "Voitit kalahuutokaupan",
        body: `${species} · ${kilos} kg voitettiin hinnalla ${price(event.final_price_per_kg)} €/kg. Kauppa näkyy Huutokaupat-välilehdellä.`,
        eventType: "auction_won",
        data: routeData,
      }));
    }
  }

  return response(200, {
    ok: true,
    finalizedCount: Number(finalizedCount || 0),
    notificationEvents: (events || []).length,
    pushAttempts: results.length,
    pushFailures: results.filter((item) => !item.ok).length,
  });
});
