import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const safe = (value: unknown) => String(value || "").trim();

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const authHeader = request.headers.get("Authorization") || "";
    const client = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError || !authData.user) return json(401, { error: "Kirjautuminen vaaditaan" });
    const body = await request.json().catch(() => ({}));
    const action = safe(body.action);

    if (action === "reserve") {
      const { data, error } = await client.rpc("reserve_consumer_listing", {
        p_listing_id: safe(body.listingId),
        p_variant_id: safe(body.variantId),
        p_unit_count: Number(body.unitCount || 0),
        p_phone: safe(body.phone),
        p_note: safe(body.note),
      });
      if (error) return json(400, { error: error.message });
      if (data?.seller_user_id && serviceRoleKey) {
        const admin = createClient(url, serviceRoleKey);
        const { data: listing } = await admin.from("consumer_listings").select("product_name").eq("id", data.listing_id).maybeSingle();
        try {
          await fetch(`${url}/functions/v1/send-push-notification`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${serviceRoleKey}` },
            body: JSON.stringify({
              targetUserId: data.seller_user_id,
              title: "Uusi kuluttajavaraus",
              body: `${Number(data.unit_count || 0)} × ${safe(data.variant_label)} · ${safe(listing?.product_name) || "Kalaerä"}`,
              eventType: "consumer_order_reserved",
              data: { route: "dashboard", consumerOrderId: data.id, consumerListingId: data.listing_id },
            }),
          });
        } catch (pushError) {
          console.error("consumer-order-action:seller-push-failed", String(pushError));
        }
      }
      return json(200, { order: data });
    }

    if (action === "subscribe") {
      const { data, error } = await client.from("consumer_alert_subscriptions").upsert({
        user_id: authData.user.id,
        species: safe(body.species),
        municipality: safe(body.municipality),
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,species,municipality" }).select("*").single();
      if (error) return json(400, { error: error.message });
      return json(200, { subscription: data });
    }

    if (action === "seller_update_order") {
      const allowedStatuses = new Set(["confirmed", "ready", "collected", "cancelled"]);
      const status = safe(body.status);
      if (!allowedStatuses.has(status)) return json(400, { error: "Virheellinen tila" });
      const finalWeightKg = body.finalWeightKg == null || safe(body.finalWeightKg) === "" ? null : Number(body.finalWeightKg);
      const { data, error } = await client.rpc("seller_update_consumer_order", {
        p_order_id: safe(body.orderId),
        p_status: status,
        p_final_weight_kg: finalWeightKg,
      });
      if (error) return json(400, { error: error.message });
      return json(200, { order: data });
    }

    return json(400, { error: "Tuntematon toiminto" });
  } catch (error) {
    return json(500, { error: String(error?.message || error || "Toiminto epäonnistui") });
  }
});
