import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const safe = (value: unknown) => String(value || "").trim();
const normalized = (value: unknown) => safe(value).toLocaleLowerCase("fi-FI");
const escapeHtml = (value: unknown) => safe(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const supabaseUrl = safe(Deno.env.get("SUPABASE_URL"));
    const anonKey = safe(Deno.env.get("SUPABASE_ANON_KEY"));
    const serviceRoleKey = safe(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    const authHeader = request.headers.get("Authorization") || "";
    if (!supabaseUrl || !anonKey || !serviceRoleKey) return json(500, { error: "Palvelinasetukset puuttuvat" });

    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: authData, error: authError } = await authClient.auth.getUser();
    if (authError || !authData.user) return json(401, { error: "Kirjautuminen vaaditaan" });

    const body = await request.json().catch(() => ({}));
    const listingId = safe(body.listingId);
    if (!listingId) return json(400, { error: "Kalaerän tunniste puuttuu" });

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: listing, error: listingError } = await admin
      .from("consumer_listings")
      .select("id, seller_user_id, species, product_name, municipality, pickup_location, pickup_start, pickup_end, order_deadline, status")
      .eq("id", listingId)
      .maybeSingle();
    if (listingError || !listing) return json(404, { error: "Kuluttajaerää ei löytynyt" });
    if (safe(listing.seller_user_id) !== authData.user.id) return json(403, { error: "Ei oikeutta lähettää tämän erän ilmoituksia" });
    if (listing.status !== "published") return json(409, { error: "Kalaerä ei ole julkaistu" });

    const { data: subscriptions, error: subscriptionError } = await admin
      .from("consumer_alert_subscriptions")
      .select("user_id, species, municipality")
      .eq("is_active", true)
      .limit(5000);
    if (subscriptionError) throw subscriptionError;

    const candidateUserIds = Array.from(new Set((subscriptions || [])
      .filter((subscription) => (!safe(subscription.species) || normalized(subscription.species) === normalized(listing.species))
        && (!safe(subscription.municipality) || normalized(subscription.municipality) === normalized(listing.municipality)))
      .map((subscription) => safe(subscription.user_id))
      .filter(Boolean)));

    if (candidateUserIds.length === 0) return json(200, { ok: true, recipients: 0, pushDelivered: 0, emailDelivered: 0 });
    const { data: consumerProfiles, error: profileError } = await admin
      .from("profiles")
      .select("id")
      .in("id", candidateUserIds)
      .eq("role", "consumer")
      .eq("is_active", true);
    if (profileError) throw profileError;
    const consumerIds = new Set((consumerProfiles || []).map((profile) => safe(profile.id)));

    const publicBaseUrl = safe(Deno.env.get("PUBLIC_APP_URL")) || "https://suoraan-kalastajalta.vercel.app";
    const listingUrl = `${publicBaseUrl.replace(/\/$/, "")}/kuluttaja/era/${encodeURIComponent(listing.id)}`;
    const title = `${safe(listing.species) || "Tuore kala"}a myynnissä`;
    const pickupLabel = listing.pickup_start
      ? new Date(listing.pickup_start).toLocaleString("fi-FI", { timeZone: "Europe/Helsinki", dateStyle: "short", timeStyle: "short" })
      : "Noutoaika sovitaan";
    const message = `${safe(listing.product_name)} · nouto ${pickupLabel} · ${safe(listing.pickup_location)}`;
    const resendApiKey = safe(Deno.env.get("RESEND_API_KEY"));
    const fromEmail = safe(Deno.env.get("FROM_EMAIL") || Deno.env.get("RESEND_FROM_EMAIL")) || "Suoraan Kalastajalta <ilmoitukset@mail.suoraankalastajalta.fi>";
    const deliveries = [];

    for (const userId of candidateUserIds.filter((id) => consumerIds.has(id))) {
      const { data: existingDelivery } = await admin.from("consumer_listing_notification_deliveries")
        .select("push_delivered, email_delivered")
        .eq("listing_id", listing.id).eq("user_id", userId).maybeSingle();
      if (!existingDelivery) {
        const { error: deliveryInsertError } = await admin.from("consumer_listing_notification_deliveries").insert({ listing_id: listing.id, user_id: userId });
        if (deliveryInsertError && deliveryInsertError.code !== "23505") throw deliveryInsertError;
      }

      let pushDelivered = Boolean(existingDelivery?.push_delivered);
      if (!pushDelivered) {
        const pushResponse = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${serviceRoleKey}` },
          body: JSON.stringify({
            targetUserId: userId,
            title,
            body: message,
            eventType: "consumer_listing_published",
            data: { route: "consumer_marketplace", consumerListingId: listing.id, url: listingUrl },
          }),
        });
        const pushResult = await pushResponse.json().catch(() => ({}));
        pushDelivered = pushResponse.ok && Number(pushResult.delivered || 0) > 0;
      }

      let emailDelivered = Boolean(existingDelivery?.email_delivered);
      if (resendApiKey && !emailDelivered) {
        const { data: userResult } = await admin.auth.admin.getUserById(userId);
        const email = safe(userResult?.user?.email).toLowerCase();
        if (email) {
          const emailResponse = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: fromEmail,
              to: [email],
              subject: `${title} – ${safe(listing.municipality)}`,
              text: `${message}\n\nKatso kalaerä ja varaa: ${listingUrl}`,
              html: `<h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p><p><a href="${escapeHtml(listingUrl)}">Katso kalaerä ja varaa</a></p>`,
            }),
          });
          emailDelivered = emailResponse.ok;
        }
      }

      await admin.from("consumer_listing_notification_deliveries").update({
        push_attempted: true,
        push_delivered: pushDelivered,
        email_attempted: Boolean(resendApiKey),
        email_delivered: emailDelivered,
      }).eq("listing_id", listing.id).eq("user_id", userId);
      deliveries.push({ userId, pushDelivered, emailDelivered });
    }

    return json(200, {
      ok: true,
      recipients: deliveries.length,
      pushDelivered: deliveries.filter((delivery) => delivery.pushDelivered).length,
      emailDelivered: deliveries.filter((delivery) => delivery.emailDelivered).length,
      listingUrl,
    });
  } catch (error) {
    return json(500, { error: String(error instanceof Error ? error.message : error) });
  }
});
