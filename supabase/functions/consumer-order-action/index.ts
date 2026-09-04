import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const safe = (value: unknown) => String(value || "").trim();
const htmlEscapes: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (value: unknown) => safe(value).replace(/[&<>"']/g, (character) => htmlEscapes[character] || character);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const authHeader = request.headers.get("Authorization") || "";
    const client = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const body = await request.json().catch(() => ({}));
    const action = safe(body.action);
    const { data: authData } = authHeader
      ? await client.auth.getUser()
      : { data: { user: null } };
    const admin = serviceRoleKey ? createClient(url, serviceRoleKey) : null;

    if (action === "reserve") {
      const name = safe(body.name);
      const email = safe(body.email).toLowerCase();
      const phone = safe(body.phone);
      if (name.length < 2) return json(400, { error: "Varaajan nimi vaaditaan" });
      if (!/^\S+@\S+\.\S+$/.test(email)) return json(400, { error: "Voimassa oleva sähköpostiosoite vaaditaan" });
      if (phone.length < 5) return json(400, { error: "Puhelinnumero vaaditaan" });

      let isActiveConsumer = false;
      if (authData.user && admin) {
        const { data: profile } = await admin.from("profiles").select("role, is_active").eq("id", authData.user.id).maybeSingle();
        isActiveConsumer = profile?.role === "consumer" && profile?.is_active === true;
      }
      if (!isActiveConsumer && !admin) return json(500, { error: "Varauspalvelun määritys puuttuu" });

      const reservationClient = isActiveConsumer ? client : admin!;
      const reservationFunction = isActiveConsumer ? "reserve_consumer_listing" : "reserve_consumer_listing_guest";
      const reservationPayload = {
        p_listing_id: safe(body.listingId),
        p_variant_id: safe(body.variantId),
        p_unit_count: Number(body.unitCount || 0),
        p_name: name,
        p_phone: phone,
        p_note: safe(body.note),
        ...(!isActiveConsumer ? { p_email: email } : {}),
      };
      const { data, error } = await reservationClient.rpc(reservationFunction, reservationPayload);
      if (error) return json(400, { error: error.message });
      let confirmationEmailSent = false;
      if (data?.seller_user_id && serviceRoleKey) {
        const { data: listing } = await admin!
          .from("consumer_listings")
          .select("product_name, seller_name, pickup_location, pickup_start, pickup_end")
          .eq("id", data.listing_id)
          .maybeSingle();
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
        const resendApiKey = safe(Deno.env.get("RESEND_API_KEY"));
        const recipientEmail = safe(data.consumer_email).toLowerCase();
        if (resendApiKey && recipientEmail) {
          const fromEmail = safe(Deno.env.get("FROM_EMAIL") || Deno.env.get("RESEND_FROM_EMAIL")) || "Suoraan Kalastajalta <ilmoitukset@mail.suoraankalastajalta.fi>";
          const pickupStart = listing?.pickup_start ? new Date(listing.pickup_start).toLocaleString("fi-FI", { timeZone: "Europe/Helsinki", dateStyle: "short", timeStyle: "short" }) : "Sovitaan kalastajan kanssa";
          const pickupEnd = listing?.pickup_end ? new Date(listing.pickup_end).toLocaleTimeString("fi-FI", { timeZone: "Europe/Helsinki", hour: "2-digit", minute: "2-digit" }) : "";
          try {
            const emailResponse = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from: fromEmail,
                to: [recipientEmail],
                subject: `Varausvahvistus: ${safe(listing?.product_name) || "kalaerä"}`,
                html: `<h2>Varaus meni perille</h2><p>Hei ${escapeHtml(data.consumer_name)},</p><p>Varauksesi on tallennettu ja kalastaja on saanut siitä tiedon.</p><p><strong>Tuote:</strong> ${escapeHtml(listing?.product_name || "Kalaerä")}<br><strong>Määrä:</strong> ${Number(data.unit_count || 0)} × ${escapeHtml(data.variant_label)}<br><strong>Yhteensä:</strong> ${Number(data.total_including_vat || 0).toLocaleString("fi-FI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €<br><strong>Nouto:</strong> ${escapeHtml(listing?.pickup_location || "Sovitaan kalastajan kanssa")}<br><strong>Noudettavissa:</strong> ${escapeHtml(`${pickupStart}${pickupEnd ? `–${pickupEnd}` : ""}`)}<br><strong>Varaustunnus:</strong> ${escapeHtml(safe(data.id).slice(0, 8).toUpperCase())}</p><p>Maksu suoritetaan suoraan kalastajalle noudon yhteydessä.</p>`,
                text: `Varaus meni perille\n\nHei ${safe(data.consumer_name)}, varauksesi on tallennettu ja kalastaja on saanut siitä tiedon.\n\nTuote: ${safe(listing?.product_name) || "Kalaerä"}\nMäärä: ${Number(data.unit_count || 0)} × ${safe(data.variant_label)}\nYhteensä: ${Number(data.total_including_vat || 0).toLocaleString("fi-FI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €\nNouto: ${safe(listing?.pickup_location) || "Sovitaan kalastajan kanssa"}\nNoudettavissa: ${pickupStart}${pickupEnd ? `–${pickupEnd}` : ""}\nVaraustunnus: ${safe(data.id).slice(0, 8).toUpperCase()}\n\nMaksu suoritetaan suoraan kalastajalle noudon yhteydessä.`,
              }),
            });
            confirmationEmailSent = emailResponse.ok;
            if (!emailResponse.ok) console.error("consumer-order-action:confirmation-email-failed", await emailResponse.text());
          } catch (emailError) {
            console.error("consumer-order-action:confirmation-email-failed", String(emailError));
          }
        }
      }
      return json(200, { order: data, confirmationEmailSent });
    }

    if (!authData.user) return json(401, { error: "Kirjautuminen vaaditaan" });

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
