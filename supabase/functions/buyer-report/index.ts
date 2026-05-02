import { buildBuyerReport } from "../_shared/buyerReport.js";
import { requireBuyerContext } from "../_shared/buyerAuth.ts";
import { corsHeaders, jsonResponse, safeString } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const buyerContext = await requireBuyerContext(req);
  if (!buyerContext.ok) {
    return buyerContext.response;
  }

  try {
    const buyerId = safeString(buyerContext.buyer?.id);
    const buyerEmail = safeString(buyerContext.buyer?.email).toLowerCase();

    let query = buyerContext.adminClient
      .from("buyer_offers")
      .select(`
        id,
        batch_id,
        status,
        species_summary,
        total_kilos,
        reserved_kilos,
        price_per_kg,
        counter_price_per_kg,
        trade_value,
        delivery_cost,
        buyer_message,
        notes,
        area,
        spot,
        delivery_method,
        earliest_delivery_date,
        fulfillment_status,
        billing_status,
        buyer_delivery_city,
        buyer_delivery_address,
        buyer_billing_email,
        seller_name,
        seller_user_id,
        seller_contact_email,
        seller_email,
        created_at,
        updated_at
      `)
      .eq("status", "accepted")
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (buyerId && buyerEmail) {
      query = query.or(`buyer_id.eq.${buyerId},buyer_email.eq.${buyerEmail}`);
    } else if (buyerId) {
      query = query.eq("buyer_id", buyerId);
    } else if (buyerEmail) {
      query = query.eq("buyer_email", buyerEmail);
    } else {
      return jsonResponse(403, { error: "Buyer account missing email and buyer id" });
    }

    const { data, error } = await query;
    if (error) {
      return jsonResponse(500, { error: error.message });
    }

    return jsonResponse(200, {
      ok: true,
      report: buildBuyerReport(data || [], buyerContext.buyer || {}),
    });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
