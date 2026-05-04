import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function safeString(value: unknown) {
  return String(value || "").trim();
}

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function invokeInternalFunction(
  supabaseUrl: string,
  serviceRoleKey: string,
  functionName: string,
  payload: Record<string, unknown>,
) {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        data,
        error: safeString((data as Record<string, unknown>)?.error) || `HTTP ${response.status}`,
      };
    }

    return { data, error: "" };
  } catch (error) {
    return {
      data: {},
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const supabaseUrl = safeString(Deno.env.get("SUPABASE_URL"));
    const anonKey = safeString(Deno.env.get("SUPABASE_ANON_KEY"));
    const serviceRoleKey = safeString(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse(500, { error: "Missing Supabase environment variables" });
    }

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) {
      return jsonResponse(401, { error: "Missing authorization header" });
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: authData, error: authError } = await authClient.auth.getUser();
    if (authError || !authData.user) {
      return jsonResponse(401, { error: authError?.message || "Unauthorized" });
    }

    const callerUserId = safeString(authData.user.id);
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { entry, recipients, offerInsertBase, pushNotification } = await req.json();
    if (!entry || !offerInsertBase || !Array.isArray(recipients) || recipients.length === 0) {
      return jsonResponse(400, { error: "Missing entry, recipients or offerInsertBase" });
    }

    const normalizedRecipients = recipients
      .map((recipient) => ({
        ...recipient,
        email: safeString(recipient?.email).toLowerCase(),
      }))
      .filter((recipient) => recipient.email);

    if (normalizedRecipients.length === 0) {
      return jsonResponse(400, { error: "No valid recipients" });
    }

    const insertedRecipients: Array<Record<string, unknown>> = [];
    const failed: Array<Record<string, unknown>> = [];
    const sent: Array<Record<string, unknown>> = [];

    for (const recipientChunk of chunkArray(normalizedRecipients, 10)) {
      const insertResults = await Promise.all(recipientChunk.map(async (recipient) => {
        const insertRow = {
          batch_id: offerInsertBase.batch_id || null,
          buyer_id: safeString(recipient.buyer_id) || null,
          buyer_email: recipient.email,
          seller_user_id: callerUserId,
          seller_name: offerInsertBase.seller_name || null,
          total_kilos: toNullableNumber(offerInsertBase.total_kilos),
          price_per_kg: toNullableNumber(offerInsertBase.price_per_kg),
          seller_origin_city: offerInsertBase.seller_origin_city || null,
          delivery_possible: Boolean(offerInsertBase.delivery_possible),
          species_summary: offerInsertBase.species_summary || null,
          area: offerInsertBase.area || null,
          spot: offerInsertBase.spot || null,
          gear: offerInsertBase.gear || null,
          delivery_method: offerInsertBase.delivery_method || "Nouto",
          transport_mode: offerInsertBase.transport_mode || null,
          origin_point_id: offerInsertBase.origin_point_id || null,
          transport_company_id: recipient.carrier_id || offerInsertBase.transport_company_id || null,
          delivery_destination_city: recipient.destination_city || null,
          delivery_destinations: Array.isArray(offerInsertBase.delivery_destinations) ? offerInsertBase.delivery_destinations : [],
          route_price_eur: toNullableNumber(recipient.route_price_eur),
          total_price_eur: toNullableNumber(recipient.total_price_eur),
          delivered_price_per_kg: toNullableNumber(recipient.delivered_price_per_kg),
          delivery_area: offerInsertBase.delivery_area || null,
          delivery_cost: toNullableNumber(offerInsertBase.delivery_cost),
          earliest_delivery_date: offerInsertBase.earliest_delivery_date || null,
          cold_transport: Boolean(offerInsertBase.cold_transport),
          notes: offerInsertBase.notes || null,
          status: "sent",
          billing_status: "unbilled",
          owner_commission_status: "unbilled",
        };

        const { data, error } = await adminClient
          .from("buyer_offers")
          .insert(insertRow)
          .select("id")
          .single();

        if (error) {
          return {
            ok: false,
            recipient,
            error: error.message || "buyer_offers insert failed",
          };
        }

        return {
          ok: true,
          recipient,
          offerId: safeString(data?.id),
        };
      }));

      insertResults.forEach((result) => {
        if (!result.ok) {
          failed.push({
            company_name: result.recipient.company_name,
            contact_name: result.recipient.contact_name,
            email: result.recipient.email,
            channel: result.recipient.channel,
            error: result.error,
          });
          return;
        }
        insertedRecipients.push({
          ...result.recipient,
          offerId: result.offerId,
        });
      });
    }

    for (const emailChunk of chunkArray(insertedRecipients, 25)) {
      const emailRecipients = emailChunk.map((recipient) => ({
        email: recipient.email,
        company_name: recipient.company_name,
        offer_id: recipient.offerId,
        offer_link: safeString(entry.offerUrlBase) ? `${safeString(entry.offerUrlBase)}?offer=${safeString(recipient.offerId)}` : null,
        delivery_destination_city: recipient.destination_city || "",
        route_price_eur: recipient.route_price_eur,
        total_price_eur: recipient.total_price_eur,
        delivered_price_per_kg: recipient.delivered_price_per_kg,
        carrier_name: recipient.carrier_name || "",
      }));

      const emailResult = await invokeInternalFunction(
        supabaseUrl,
        serviceRoleKey,
        "send-catch-offer-email",
        { entry, recipients: emailRecipients },
      );

      if (emailResult.error) {
        emailChunk.forEach((recipient) => {
          failed.push({
            company_name: recipient.company_name,
            contact_name: recipient.contact_name,
            email: recipient.email,
            channel: recipient.channel,
            error: emailResult.error,
          });
        });
        continue;
      }

      const emailRows = Array.isArray((emailResult.data as Record<string, unknown>)?.results)
        ? (emailResult.data as Record<string, unknown>).results as Array<Record<string, unknown>>
        : [];

      for (let index = 0; index < emailChunk.length; index += 1) {
        const recipient = emailChunk[index];
        const emailRow = emailRows[index] || {};
        const emailSucceeded = emailRow?.ok === true;
        const emailErrorMessage = safeString(emailRow?.error) || "Tarjoussähköpostin lähetys epäonnistui";

        let pushSkipped = true;
        let pushSkipReason = "no_buyer_id";
        let pushErrorMessage = "";
        if (safeString(recipient.buyer_id)) {
          const pushResult = await invokeInternalFunction(
            supabaseUrl,
            serviceRoleKey,
            "send-push-notification",
            {
              targetBuyerId: recipient.buyer_id,
              title: pushNotification?.title || "Uusi kalatarjous",
              body: pushNotification?.body || "Sinulle on lähetetty uusi tarjous.",
              eventType: pushNotification?.eventType || "offer_sent",
              data: {
                route: pushNotification?.route || "offers",
                offerId: recipient.offerId,
                batchId: pushNotification?.batchId || offerInsertBase.batch_id || "",
              },
            },
          );
          if (pushResult.error) {
            pushErrorMessage = pushResult.error;
          } else {
            pushSkipped = Boolean((pushResult.data as Record<string, unknown>)?.skipped);
            pushSkipReason = safeString((pushResult.data as Record<string, unknown>)?.reason);
          }
        }

        const pushDelivered = Boolean(safeString(recipient.buyer_id)) && !pushSkipped && !pushErrorMessage;

        if (emailSucceeded || pushDelivered) {
          sent.push({
            buyer_id: recipient.buyer_id,
            company_name: recipient.company_name,
            contact_name: recipient.contact_name,
            email: recipient.email,
            channel: recipient.channel,
            offer_id: recipient.offerId,
            offer_link: safeString(entry.offerUrlBase) ? `${safeString(entry.offerUrlBase)}?offer=${safeString(recipient.offerId)}` : null,
            pushSkipped,
            pushSkipReason,
            emailFailed: !emailSucceeded,
            emailError: emailSucceeded ? "" : emailErrorMessage,
          });
        } else {
          failed.push({
            company_name: recipient.company_name,
            contact_name: recipient.contact_name,
            email: recipient.email,
            channel: recipient.channel,
            error: emailErrorMessage || pushErrorMessage || "Tarjouksen ilmoitusten lähetys epäonnistui",
          });
        }
      }
    }

    return jsonResponse(200, {
      ok: failed.length === 0,
      sent,
      failed,
      recipientCount: normalizedRecipients.length,
      insertedCount: insertedRecipients.length,
    });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
