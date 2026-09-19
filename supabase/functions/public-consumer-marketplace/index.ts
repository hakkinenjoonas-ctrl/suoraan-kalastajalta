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
      .select("id, seller_user_id, batch_id, species, product_name, description, seller_name, municipality, pickup_location, catch_date, vat_rate, image_url, cold_storage, pickup_start, pickup_end, order_deadline, payment_methods, status, created_at, variants:consumer_listing_variants(id, sale_unit_type, label, package_size_kg, unit_price_including_vat, min_weight_kg, max_weight_kg, price_per_kg_including_vat, available_units, sort_order)")
      .eq("status", "published")
      .gt("order_deadline", new Date().toISOString())
      .order("created_at", { ascending: false });
    if (error) throw error;
    const sellerIds = Array.from(new Set((data || []).map((listing) => listing.seller_user_id).filter(Boolean)));
    const { data: sellerProfiles, error: sellerError } = sellerIds.length > 0
      ? await client
        .from("profiles")
        .select("id, company_name, display_name, business_id, address, postcode, city, contact_email, email, phone")
        .in("id", sellerIds)
      : { data: [], error: null };
    if (sellerError) throw sellerError;
    const sellersById = new Map((sellerProfiles || []).map((profile) => [profile.id, profile]));
    const listings = (data || []).map((listing) => ({
      ...Object.fromEntries(Object.entries(listing).filter(([key]) => key !== "seller_user_id")),
      seller_name: sellersById.get(listing.seller_user_id)?.company_name || listing.seller_name,
      seller_business_id: sellersById.get(listing.seller_user_id)?.business_id || "",
      seller_address: sellersById.get(listing.seller_user_id)?.address || "",
      seller_postcode: sellersById.get(listing.seller_user_id)?.postcode || "",
      seller_city: sellersById.get(listing.seller_user_id)?.city || "",
      seller_email: sellersById.get(listing.seller_user_id)?.contact_email || sellersById.get(listing.seller_user_id)?.email || "",
      seller_phone: sellersById.get(listing.seller_user_id)?.phone || "",
      seller_is_trader: true,
      variants: (listing.variants || [])
        .filter((variant) => Number(variant.available_units || 0) > 0)
        .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0)),
    })).filter((listing) => listing.variants.length > 0);
    return json(200, { listings });
  } catch (error) {
    return json(500, { error: String(error?.message || error || "Kalaerien haku epäonnistui") });
  }
});
