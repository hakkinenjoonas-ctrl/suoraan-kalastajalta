import { requireAuthenticatedProfileContext } from "../_shared/buyerAuth.ts";
import { corsHeaders, jsonResponse, safeString } from "../_shared/http.ts";

function optionalNumber(value: unknown) {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const authContext = await requireAuthenticatedProfileContext(req);
  if (!authContext.ok) return authContext.response;
  if (safeString(authContext.profile?.role) !== "buyer") {
    return jsonResponse(403, { error: "Only buyer users can create a buyer profile" });
  }

  const body = await req.json().catch(() => ({}));
  const email = safeString(authContext.profile?.email).toLowerCase();
  const companyName = safeString(body.company_name);
  if (!email || !companyName) {
    return jsonResponse(400, { error: "Sähköposti ja yrityksen nimi ovat pakollisia." });
  }

  const buyerPayload = {
    company_name: companyName,
    buyer_type: safeString(body.buyer_type) || "ravintola",
    contact_name: safeString(body.contact_name),
    email,
    phone: safeString(body.phone),
    min_kg: optionalNumber(body.min_kg),
    max_kg: optionalNumber(body.max_kg),
    vat_liable: Boolean(body.vat_liable),
    vat_number: Boolean(body.vat_liable) ? safeString(body.vat_number).toUpperCase() : "",
    city: safeString(body.city),
    delivery_address: safeString(body.delivery_address),
    delivery_postcode: safeString(body.delivery_postcode),
    delivery_city: safeString(body.delivery_city),
    billing_address: safeString(body.billing_address),
    billing_postcode: safeString(body.billing_postcode),
    billing_city: safeString(body.billing_city),
    billing_email: safeString(body.billing_email).toLowerCase() || email,
    business_id: safeString(body.business_id),
    notes: safeString(body.notes),
    is_active: true,
  };

  const { adminClient, callerUserId } = authContext;
  const { data: existingBuyer, error: lookupError } = await adminClient
    .from("buyers")
    .select("id")
    .or(`email.eq.${email},billing_email.eq.${email}`)
    .limit(1)
    .maybeSingle();
  if (lookupError) return jsonResponse(500, { error: lookupError.message });

  const buyerResult = existingBuyer?.id
    ? await adminClient.from("buyers").update(buyerPayload).eq("id", existingBuyer.id).select("*").single()
    : await adminClient.from("buyers").insert(buyerPayload).select("*").single();
  if (buyerResult.error || !buyerResult.data?.id) {
    return jsonResponse(500, { error: buyerResult.error?.message || "Ostajaprofiilia ei voitu luoda." });
  }

  const buyerId = safeString(buyerResult.data.id);
  const { error: profileError } = await adminClient
    .from("profiles")
    .update({ buyer_id: buyerId })
    .eq("id", callerUserId);
  if (profileError) return jsonResponse(500, { error: profileError.message });

  const { error: allowedError } = await adminClient
    .from("allowed_users")
    .update({ buyer_id: buyerId })
    .eq("role", "buyer")
    .eq("email", email);
  if (allowedError) return jsonResponse(500, { error: allowedError.message });

  return jsonResponse(200, { ok: true, buyer: buyerResult.data });
});
