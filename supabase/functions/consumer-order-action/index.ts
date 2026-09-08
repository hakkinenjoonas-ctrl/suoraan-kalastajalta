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

    if (action === "reserve" || action === "reserve_multiple") {
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
      if (!admin) return json(500, { error: "Varauspalvelun määritys puuttuu" });

      const requestedItems = action === "reserve_multiple"
        ? (Array.isArray(body.items) ? body.items : []).map((item: Record<string, unknown>) => ({ variantId: safe(item?.variantId), unitCount: Number(item?.unitCount || 0) }))
        : [{ variantId: safe(body.variantId), unitCount: Number(body.unitCount || 0) }];
      if (requestedItems.length < 1 || requestedItems.some((item) => !item.variantId || !Number.isInteger(item.unitCount) || item.unitCount < 1)) {
        return json(400, { error: "Valitse vähintään yksi pakkauskoko ja määrä" });
      }
      const { data: reservationResult, error } = await admin.rpc("reserve_consumer_listing_multiple", {
        p_listing_id: safe(body.listingId),
        p_items: requestedItems,
        p_consumer_user_id: isActiveConsumer ? authData.user?.id : null,
        p_name: name,
        p_email: email,
        p_phone: phone,
        p_note: safe(body.note),
      });
      if (error) return json(400, { error: error.message });
      const orders = Array.isArray(reservationResult?.orders) ? reservationResult.orders : [];
      const data = orders[0] || null;
      if (!data) return json(500, { error: "Varauksen tallennus epäonnistui" });
      const itemSummary = orders.map((order: Record<string, unknown>) => `${Number(order.unit_count || 0)} × ${safe(order.variant_label)}`).join(", ");
      const grossTotal = orders.reduce((sum: number, order: Record<string, unknown>) => sum + Number(order.total_including_vat || 0), 0);
      let confirmationEmailSent = false;
      if (data?.seller_user_id && serviceRoleKey) {
        const { data: listing } = await admin!
          .from("consumer_listings")
          .select("product_name, seller_name, pickup_location, pickup_start, pickup_end, payment_methods")
          .eq("id", data.listing_id)
          .maybeSingle();
        try {
          await fetch(`${url}/functions/v1/send-push-notification`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${serviceRoleKey}` },
            body: JSON.stringify({
              targetUserId: data.seller_user_id,
              title: "Uusi kuluttajavaraus",
              body: `${itemSummary} · ${safe(listing?.product_name) || "Kalaerä"}`,
              eventType: "consumer_order_reserved",
              data: { route: "dashboard", consumerOrderId: data.id, consumerListingId: data.listing_id, reservationGroupId: reservationResult?.reservationGroupId },
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
          const paymentMethods = Array.isArray(listing?.payment_methods)
            ? listing.payment_methods.map((method: unknown) => safe(method)).filter(Boolean).join(", ")
            : "";
          const paymentMethodText = paymentMethods || "Sovitaan kalastajan kanssa";
          try {
            const emailResponse = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from: fromEmail,
                to: [recipientEmail],
                subject: `Varausvahvistus: ${safe(listing?.product_name) || "kalaerä"}`,
                html: `<h2>Varaus meni perille</h2><p>Hei ${escapeHtml(data.consumer_name)},</p><p>Varauksesi on tallennettu ja kalastaja on saanut siitä tiedon.</p><p><strong>Tuote:</strong> ${escapeHtml(listing?.product_name || "Kalaerä")}<br><strong>Määrät:</strong> ${escapeHtml(itemSummary)}<br><strong>Yhteensä:</strong> ${grossTotal.toLocaleString("fi-FI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €<br><strong>Nouto:</strong> ${escapeHtml(listing?.pickup_location || "Sovitaan kalastajan kanssa")}<br><strong>Noudettavissa:</strong> ${escapeHtml(`${pickupStart}${pickupEnd ? `–${pickupEnd}` : ""}`)}<br><strong>Maksutavat:</strong> ${escapeHtml(paymentMethodText)}<br><strong>Varaustunnus:</strong> ${escapeHtml(safe(reservationResult?.reservationGroupId).slice(0, 8).toUpperCase())}</p><p>Maksu suoritetaan suoraan kalastajalle valitulla maksutavalla.</p>`,
                text: `Varaus meni perille\n\nHei ${safe(data.consumer_name)}, varauksesi on tallennettu ja kalastaja on saanut siitä tiedon.\n\nTuote: ${safe(listing?.product_name) || "Kalaerä"}\nMäärät: ${itemSummary}\nYhteensä: ${grossTotal.toLocaleString("fi-FI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €\nNouto: ${safe(listing?.pickup_location) || "Sovitaan kalastajan kanssa"}\nNoudettavissa: ${pickupStart}${pickupEnd ? `–${pickupEnd}` : ""}\nMaksutavat: ${paymentMethodText}\nVaraustunnus: ${safe(reservationResult?.reservationGroupId).slice(0, 8).toUpperCase()}\n\nMaksu suoritetaan suoraan kalastajalle valitulla maksutavalla.`,
              }),
            });
            confirmationEmailSent = emailResponse.ok;
            if (!emailResponse.ok) console.error("consumer-order-action:confirmation-email-failed", await emailResponse.text());
          } catch (emailError) {
            console.error("consumer-order-action:confirmation-email-failed", String(emailError));
          }
        }
      }
      return json(200, { order: data, orders, reservationGroupId: reservationResult?.reservationGroupId, confirmationEmailSent });
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

      let cancellationEmailSent = false;
      let cancellationPushSent = false;
      let notificationWarning = "";
      if (status === "cancelled") {
        const order = data as Record<string, unknown> | null;
        const recipientEmail = safe(order?.consumer_email).toLowerCase();
        const resendApiKey = safe(Deno.env.get("RESEND_API_KEY"));
        const fromEmail = safe(Deno.env.get("FROM_EMAIL") || Deno.env.get("RESEND_FROM_EMAIL")) || "Suoraan Kalastajalta <ilmoitukset@mail.suoraankalastajalta.fi>";
        const { data: listing } = admin && order?.listing_id
          ? await admin
            .from("consumer_listings")
            .select("product_name, seller_name, pickup_location, pickup_start, pickup_end")
            .eq("id", order.listing_id)
            .maybeSingle()
          : { data: null };
        const productName = safe(listing?.product_name) || "Kalaerä";
        const sellerName = safe(listing?.seller_name) || "Kalastaja";
        const unitCount = Number(order?.unit_count || order?.package_count || 0);
        const itemSummary = `${unitCount} × ${safe(order?.variant_label) || (order?.sale_unit_type === "whole_fish" ? "kokonainen kala" : "pakkaus")}`;
        const grossTotal = Number(order?.total_including_vat || 0);
        const pickupStart = listing?.pickup_start
          ? new Date(listing.pickup_start).toLocaleString("fi-FI", { timeZone: "Europe/Helsinki", dateStyle: "short", timeStyle: "short" })
          : "Sovittu noutoaika";
        const pickupEnd = listing?.pickup_end
          ? new Date(listing.pickup_end).toLocaleTimeString("fi-FI", { timeZone: "Europe/Helsinki", hour: "2-digit", minute: "2-digit" })
          : "";
        const reservationCode = safe(order?.reservation_group_id || order?.id).slice(0, 8).toUpperCase();

        if (order?.consumer_user_id && serviceRoleKey) {
          try {
            const pushResponse = await fetch(`${url}/functions/v1/send-push-notification`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${serviceRoleKey}` },
              body: JSON.stringify({
                targetUserId: order.consumer_user_id,
                title: "Varauksesi on peruttu",
                body: `${productName} · ${itemSummary}`,
                eventType: "consumer_order_cancelled",
                data: { route: "consumer_marketplace", consumerOrderId: order.id, consumerListingId: order.listing_id, reservationGroupId: order.reservation_group_id },
              }),
            });
            cancellationPushSent = pushResponse.ok;
            if (!pushResponse.ok) console.error("consumer-order-action:cancellation-push-failed", await pushResponse.text());
          } catch (pushError) {
            console.error("consumer-order-action:cancellation-push-failed", String(pushError));
          }
        }

        if (resendApiKey && recipientEmail) {
          try {
            const emailResponse = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from: fromEmail,
                to: [recipientEmail],
                subject: `Varaus on peruttu: ${productName}`,
                html: `<h2>Varauksesi on peruttu</h2><p>Hei ${escapeHtml(order?.consumer_name)},</p><p>${escapeHtml(sellerName)} on valitettavasti perunut seuraavan varauksesi.</p><p><strong>Tuote:</strong> ${escapeHtml(productName)}<br><strong>Määrä:</strong> ${escapeHtml(itemSummary)}<br><strong>Tilauksen arvo:</strong> ${grossTotal.toLocaleString("fi-FI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €<br><strong>Noutopaikka:</strong> ${escapeHtml(listing?.pickup_location || "Sovittu noutopaikka")}<br><strong>Alkuperäinen noutoaika:</strong> ${escapeHtml(`${pickupStart}${pickupEnd ? `–${pickupEnd}` : ""}`)}<br><strong>Varaustunnus:</strong> ${escapeHtml(reservationCode)}</p><p>Perutusta varauksesta ei tarvitse maksaa. Lisätietoja saat tarvittaessa kalastajalta.</p>`,
                text: `Varauksesi on peruttu\n\nHei ${safe(order?.consumer_name)},\n\n${sellerName} on valitettavasti perunut seuraavan varauksesi.\n\nTuote: ${productName}\nMäärä: ${itemSummary}\nTilauksen arvo: ${grossTotal.toLocaleString("fi-FI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €\nNoutopaikka: ${safe(listing?.pickup_location) || "Sovittu noutopaikka"}\nAlkuperäinen noutoaika: ${pickupStart}${pickupEnd ? `–${pickupEnd}` : ""}\nVaraustunnus: ${reservationCode}\n\nPerutusta varauksesta ei tarvitse maksaa. Lisätietoja saat tarvittaessa kalastajalta.`,
              }),
            });
            cancellationEmailSent = emailResponse.ok;
            if (!emailResponse.ok) console.error("consumer-order-action:cancellation-email-failed", await emailResponse.text());
          } catch (emailError) {
            console.error("consumer-order-action:cancellation-email-failed", String(emailError));
          }
        }

        if (!cancellationEmailSent) {
          notificationWarning = "Tilaus peruttiin, mutta asiakkaalle ei voitu lähettää sähköpostia. Ota asiakkaaseen yhteyttä puhelimitse.";
        }
      }

      return json(200, { order: data, cancellationEmailSent, cancellationPushSent, notificationWarning });
    }

    return json(400, { error: "Tuntematon toiminto" });
  } catch (error) {
    return json(500, { error: String(error?.message || error || "Toiminto epäonnistui") });
  }
});
