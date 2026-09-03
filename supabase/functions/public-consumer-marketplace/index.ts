import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=30" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "GET") return json(405, { error: "Method not allowed" });
  try {
    const client = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
    const { data, error } = await client
      .from("consumer_listings")
      .select("id, batch_id, species, product_name, description, seller_name, municipality, pickup_location, catch_date, vat_rate, image_url, cold_storage, pickup_start, pickup_end, order_deadline, status, created_at, variants:consumer_listing_variants(id, sale_unit_type, label, package_size_kg, unit_price_including_vat, min_weight_kg, max_weight_kg, price_per_kg_including_vat, available_units, sort_order)")
      .eq("status", "published")
      .order("created_at", { ascending: false });
    if (error) throw error;
    const listings = (data || []).map((listing) => ({
      ...listing,
      variants: (listing.variants || [])
        .filter((variant) => Number(variant.available_units || 0) > 0)
        .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0)),
    })).filter((listing) => listing.variants.length > 0);
    return json(200, { listings });
  } catch (error) {
    return json(500, { error: String(error?.message || error || "Kalaerien haku epäonnistui") });
  }
});
