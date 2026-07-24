import {
  buildBuyerOfferActionUpdate,
  canBuyerAccessOffer,
  canManageFulfillment,
} from "../_shared/buyerOfferAction.js";
import {
  requireAuthenticatedProfileContext,
  resolveBuyerRecord,
} from "../_shared/buyerAuth.ts";
import { corsHeaders, jsonResponse, safeString } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const authContext = await requireAuthenticatedProfileContext(req);
  if (!authContext.ok) {
    return authContext.response;
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = safeString(body.action).toLowerCase();
    const offerId = safeString(body.offerId);

    if (!action || !offerId) {
      return jsonResponse(400, { error: "Missing action or offerId" });
    }

    const buyer = await resolveBuyerRecord(authContext.adminClient, authContext.profile as Record<string, unknown>).catch(() => null);
    const { data: offer, error: offerError } = await authContext.adminClient
      .from("buyer_offers")
      .select("*")
      .eq("id", offerId)
      .maybeSingle();

    if (offerError || !offer) {
      return jsonResponse(404, { error: offerError?.message || "Offer not found" });
    }

    let canAccessOffer = canBuyerAccessOffer(offer, buyer || {}, authContext.profile);
    const isSeller = safeString(offer.seller_user_id) === safeString(authContext.profile.id);
    const isOwner = safeString(authContext.profile.role) === "owner";

    // Keep the action authorization aligned with buyer_offers SELECT RLS. This
    // also covers historical offers whose buyer link or recipient email no
    // longer matches the buyer record currently linked to the profile.
    if (!canAccessOffer && safeString(authContext.profile.role) === "buyer") {
      const { data: buyerVisibleOffer, error: buyerVisibleOfferError } = await authContext.authClient
        .from("buyer_offers")
        .select("id")
        .eq("id", offerId)
        .maybeSingle();

      if (!buyerVisibleOfferError && buyerVisibleOffer?.id) {
        canAccessOffer = true;
      }
    }

    if (action === "update_fulfillment") {
      if (!canManageFulfillment(offer, authContext.profile, buyer)) {
        return jsonResponse(403, { error: "You cannot update fulfillment for this offer" });
      }
    } else if (!canAccessOffer) {
      return jsonResponse(403, { error: "You cannot update this offer" });
    }

    const updatePayload = buildBuyerOfferActionUpdate(action, offer, body);
    // Run the mutation as the authenticated caller. The buyer_offers update
    // guard relies on auth.uid() to distinguish the buyer from unrelated
    // users; a service-role update would bypass RLS but leave auth.uid() empty
    // inside the trigger and incorrectly reject legitimate buyer actions.
    const { data: updatedOffer, error: updateError } = await authContext.authClient
      .from("buyer_offers")
      .update(updatePayload)
      .eq("id", offerId)
      .select("*")
      .single();

    if (updateError) {
      return jsonResponse(500, { error: updateError.message });
    }

    return jsonResponse(200, {
      ok: true,
      action,
      actorRole: isOwner ? "owner" : isSeller ? "seller" : "buyer",
      offer: updatedOffer,
    });
  } catch (error) {
    return jsonResponse(400, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
