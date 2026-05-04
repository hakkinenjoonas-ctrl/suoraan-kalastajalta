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

function normalizePrivateKey(value: string) {
  return value.replace(/\\n/g, "\n");
}

function base64UrlEncode(input: Uint8Array | string) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function importPrivateKey(privateKeyPem: string) {
  const pem = privateKeyPem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  const binary = Uint8Array.from(atob(pem), (char) => char.charCodeAt(0));
  return await crypto.subtle.importKey(
    "pkcs8",
    binary.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function createSignedJwt(clientEmail: string, privateKey: string, tokenUri: string) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + 3600;
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64UrlEncode(JSON.stringify({
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: tokenUri,
    iat: issuedAt,
    exp: expiresAt,
  }));
  const unsignedToken = `${header}.${payload}`;
  const cryptoKey = await importPrivateKey(privateKey);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsignedToken),
  );
  return `${unsignedToken}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function getGoogleAccessToken() {
  const clientEmail = safeString(Deno.env.get("FCM_CLIENT_EMAIL"));
  const privateKey = normalizePrivateKey(safeString(Deno.env.get("FCM_PRIVATE_KEY")));
  const tokenUri = safeString(Deno.env.get("FCM_TOKEN_URI")) || "https://oauth2.googleapis.com/token";

  if (!clientEmail || !privateKey) {
    return "";
  }

  const assertion = await createSignedJwt(clientEmail, privateKey, tokenUri);
  const response = await fetch(tokenUri, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google access token failed: ${JSON.stringify(payload)}`);
  }

  return safeString(payload.access_token);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = safeString(Deno.env.get("SUPABASE_URL"));
    const anonKey = safeString(Deno.env.get("SUPABASE_ANON_KEY"));
    const serviceRoleKey = safeString(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    const projectId = safeString(Deno.env.get("FCM_PROJECT_ID"));

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse(500, { error: "Supabase environment variables missing" });
    }

    const authHeader = req.headers.get("Authorization") || "";
    let callerUserId = "";

    if (authHeader) {
      const authClient = createClient(supabaseUrl, anonKey, {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      });
      const { data: authData, error: authError } = await authClient.auth.getUser();
      if (!authError && authData.user) {
        callerUserId = safeString(authData.user.id);
      }
    }

    const body = await req.json().catch(() => ({}));
    const targetUserId = safeString(body.targetUserId);
    const targetBuyerId = safeString(body.targetBuyerId);
    const targetBuyerEmail = safeString(body.targetBuyerEmail).toLowerCase();
    const title = safeString(body.title);
    const messageBody = safeString(body.body);
    const eventType = safeString(body.eventType) || "general";
    const data = typeof body.data === "object" && body.data ? body.data : {};

    if (!title || !messageBody) {
      console.log("send-push-notification:invalid-payload", {
        hasTitle: Boolean(title),
        hasBody: Boolean(messageBody),
      });
      return jsonResponse(400, { error: "Missing title or body" });
    }
    if (!targetUserId && !targetBuyerId && !targetBuyerEmail) {
      console.log("send-push-notification:missing-target", {
        callerUserId: callerUserId || null,
        eventType,
      });
      return jsonResponse(400, { error: "Missing target user or buyer id" });
    }

    console.log("send-push-notification:start", {
      callerUserId: callerUserId || null,
      targetUserId: targetUserId || null,
      targetBuyerId: targetBuyerId || null,
      targetBuyerEmail: targetBuyerEmail || null,
      eventType,
      route: safeString(data.route),
      offerId: safeString(data.offerId),
      batchId: safeString(data.batchId),
    });

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const tokenRowsById = new Map<string, { id: string; token: string; platform: string }>();

    if (targetUserId) {
      const { data: directUserTokenRows, error: directUserTokenError } = await adminClient
        .from("app_push_tokens")
        .select("id, token, platform")
        .eq("is_active", true)
        .eq("user_id", targetUserId);

      if (directUserTokenError) {
        console.error("send-push-notification:token-query-error", {
          targetUserId: targetUserId || null,
          targetBuyerId: targetBuyerId || null,
          eventType,
          error: directUserTokenError.message,
        });
        return jsonResponse(500, { error: directUserTokenError.message });
      }

      for (const row of directUserTokenRows || []) {
        const rowId = safeString(row.id);
        if (rowId) tokenRowsById.set(rowId, row);
      }
    }

    if (targetBuyerId) {
      const { data: directBuyerTokenRows, error: directBuyerTokenError } = await adminClient
        .from("app_push_tokens")
        .select("id, token, platform")
        .eq("is_active", true)
        .eq("buyer_id", targetBuyerId);

      if (directBuyerTokenError) {
        console.error("send-push-notification:token-query-error", {
          targetUserId: targetUserId || null,
          targetBuyerId: targetBuyerId || null,
          eventType,
          error: directBuyerTokenError.message,
        });
        return jsonResponse(500, { error: directBuyerTokenError.message });
      }

      for (const row of directBuyerTokenRows || []) {
        const rowId = safeString(row.id);
        if (rowId) tokenRowsById.set(rowId, row);
      }

      const { data: linkedProfiles, error: linkedProfilesError } = await adminClient
        .from("profiles")
        .select("id")
        .eq("buyer_id", targetBuyerId);

      if (linkedProfilesError) {
        console.error("send-push-notification:linked-profiles-query-error", {
          targetBuyerId: targetBuyerId || null,
          eventType,
          error: linkedProfilesError.message,
        });
        return jsonResponse(500, { error: linkedProfilesError.message });
      }

      const linkedUserIds = Array.from(
        new Set((linkedProfiles || []).map((row) => safeString(row.id)).filter(Boolean)),
      );

      if (linkedUserIds.length > 0) {
        const { data: linkedUserTokenRows, error: linkedUserTokenError } = await adminClient
          .from("app_push_tokens")
          .select("id, token, platform")
          .eq("is_active", true)
          .in("user_id", linkedUserIds);

        if (linkedUserTokenError) {
          console.error("send-push-notification:linked-user-token-query-error", {
            targetBuyerId: targetBuyerId || null,
            eventType,
            linkedUserCount: linkedUserIds.length,
            error: linkedUserTokenError.message,
          });
          return jsonResponse(500, { error: linkedUserTokenError.message });
        }

        for (const row of linkedUserTokenRows || []) {
          const rowId = safeString(row.id);
          if (rowId) tokenRowsById.set(rowId, row);
        }
      }
    }

    if (targetBuyerEmail) {
      const { data: buyerRowsByEmail, error: buyerRowsByEmailError } = await adminClient
        .from("buyers")
        .select("id")
        .eq("email", targetBuyerEmail);

      if (buyerRowsByEmailError) {
        console.error("send-push-notification:buyer-email-query-error", {
          targetBuyerEmail: targetBuyerEmail || null,
          eventType,
          error: buyerRowsByEmailError.message,
        });
        return jsonResponse(500, { error: buyerRowsByEmailError.message });
      }

      const buyerIdsByEmail = Array.from(new Set((buyerRowsByEmail || []).map((row) => safeString(row.id)).filter(Boolean)));
      if (buyerIdsByEmail.length > 0) {
        const { data: emailBuyerTokenRows, error: emailBuyerTokenError } = await adminClient
          .from("app_push_tokens")
          .select("id, token, platform")
          .eq("is_active", true)
          .in("buyer_id", buyerIdsByEmail);

        if (emailBuyerTokenError) {
          console.error("send-push-notification:buyer-email-token-query-error", {
            targetBuyerEmail: targetBuyerEmail || null,
            eventType,
            error: emailBuyerTokenError.message,
          });
          return jsonResponse(500, { error: emailBuyerTokenError.message });
        }

        for (const row of emailBuyerTokenRows || []) {
          const rowId = safeString(row.id);
          if (rowId) tokenRowsById.set(rowId, row);
        }

        const { data: linkedProfilesByEmailBuyer, error: linkedProfilesByEmailBuyerError } = await adminClient
          .from("profiles")
          .select("id")
          .in("buyer_id", buyerIdsByEmail);

        if (linkedProfilesByEmailBuyerError) {
          console.error("send-push-notification:buyer-email-linked-profiles-query-error", {
            targetBuyerEmail: targetBuyerEmail || null,
            eventType,
            error: linkedProfilesByEmailBuyerError.message,
          });
          return jsonResponse(500, { error: linkedProfilesByEmailBuyerError.message });
        }

        const linkedUserIdsByEmailBuyer = Array.from(new Set((linkedProfilesByEmailBuyer || []).map((row) => safeString(row.id)).filter(Boolean)));
        if (linkedUserIdsByEmailBuyer.length > 0) {
          const { data: linkedUserTokenRowsByEmailBuyer, error: linkedUserTokenRowsByEmailBuyerError } = await adminClient
            .from("app_push_tokens")
            .select("id, token, platform")
            .eq("is_active", true)
            .in("user_id", linkedUserIdsByEmailBuyer);

          if (linkedUserTokenRowsByEmailBuyerError) {
            console.error("send-push-notification:buyer-email-linked-user-token-query-error", {
              targetBuyerEmail: targetBuyerEmail || null,
              eventType,
              error: linkedUserTokenRowsByEmailBuyerError.message,
            });
            return jsonResponse(500, { error: linkedUserTokenRowsByEmailBuyerError.message });
          }

          for (const row of linkedUserTokenRowsByEmailBuyer || []) {
            const rowId = safeString(row.id);
            if (rowId) tokenRowsById.set(rowId, row);
          }
        }
      }

      const { data: directProfileRowsByEmail, error: directProfileRowsByEmailError } = await adminClient
        .from("profiles")
        .select("id")
        .or(`email.eq.${targetBuyerEmail},contact_email.eq.${targetBuyerEmail}`);

      if (directProfileRowsByEmailError) {
        console.error("send-push-notification:direct-profile-email-query-error", {
          targetBuyerEmail: targetBuyerEmail || null,
          eventType,
          error: directProfileRowsByEmailError.message,
        });
        return jsonResponse(500, { error: directProfileRowsByEmailError.message });
      }

      const directProfileIdsByEmail = Array.from(new Set((directProfileRowsByEmail || []).map((row) => safeString(row.id)).filter(Boolean)));
      if (directProfileIdsByEmail.length > 0) {
        const { data: directProfileTokenRowsByEmail, error: directProfileTokenRowsByEmailError } = await adminClient
          .from("app_push_tokens")
          .select("id, token, platform")
          .eq("is_active", true)
          .in("user_id", directProfileIdsByEmail);

        if (directProfileTokenRowsByEmailError) {
          console.error("send-push-notification:direct-profile-email-token-query-error", {
            targetBuyerEmail: targetBuyerEmail || null,
            eventType,
            error: directProfileTokenRowsByEmailError.message,
          });
          return jsonResponse(500, { error: directProfileTokenRowsByEmailError.message });
        }

        for (const row of directProfileTokenRowsByEmail || []) {
          const rowId = safeString(row.id);
          if (rowId) tokenRowsById.set(rowId, row);
        }
      }
    }

    const tokenRows = Array.from(tokenRowsById.values());
    const tokens = Array.from(new Set(tokenRows.map((row) => safeString(row.token)).filter(Boolean)));
    console.log("send-push-notification:tokens-resolved", {
      targetUserId: targetUserId || null,
      targetBuyerId: targetBuyerId || null,
      eventType,
      tokenCount: tokens.length,
      tokenRowCount: tokenRows.length,
    });
    if (tokens.length === 0) {
      console.warn("send-push-notification:skipped-no-tokens", {
        targetUserId: targetUserId || null,
        targetBuyerId: targetBuyerId || null,
        eventType,
      });
      return jsonResponse(200, { ok: true, skipped: true, reason: "no_tokens" });
    }

    if (!projectId) {
      console.warn("send-push-notification:missing-fcm-project-id", {
        targetUserId: targetUserId || null,
        targetBuyerId: targetBuyerId || null,
        eventType,
        tokenCount: tokens.length,
      });
      return jsonResponse(200, { ok: true, skipped: true, reason: "missing_fcm_project_id", tokens: tokens.length });
    }

    const accessToken = await getGoogleAccessToken();
    if (!accessToken) {
      console.warn("send-push-notification:missing-fcm-credentials", {
        targetUserId: targetUserId || null,
        targetBuyerId: targetBuyerId || null,
        eventType,
        tokenCount: tokens.length,
      });
      return jsonResponse(200, { ok: true, skipped: true, reason: "missing_fcm_credentials", tokens: tokens.length });
    }

    const endpoint = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
    const results = [];

    for (const token of tokens) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token,
            notification: {
              title,
              body: messageBody,
            },
            data: Object.fromEntries(
              Object.entries({
                ...data,
                eventType,
                title,
                body: messageBody,
              }).map(([key, value]) => [key, safeString(value)])
            ),
            android: {
              priority: "high",
              notification: {
                channel_id: "trade_events_waterdrop_converted_v6",
                sound: "waterdrop_converted",
                default_vibrate_timings: true,
              },
            },
          },
        }),
      });

      const responseText = await response.text();
      let parsedBody: unknown = responseText;
      try {
        parsedBody = responseText ? JSON.parse(responseText) : {};
      } catch {
        parsedBody = responseText;
      }

      if (!response.ok) {
        const asString = typeof parsedBody === "string" ? parsedBody : JSON.stringify(parsedBody);
        if (asString.includes("UNREGISTERED") || asString.includes("registration-token-not-registered")) {
          await adminClient
            .from("app_push_tokens")
            .update({ is_active: false })
            .eq("token", token);
        }
        results.push({ ok: false, token, error: parsedBody });
      } else {
        results.push({ ok: true, token, data: parsedBody });
      }
    }

    console.log("send-push-notification:finished", {
      targetUserId: targetUserId || null,
      targetBuyerId: targetBuyerId || null,
      eventType,
      attempted: tokens.length,
      delivered: results.filter((item) => item.ok).length,
      failed: results.filter((item) => !item.ok).length,
    });

    return jsonResponse(200, {
      ok: true,
      callerAuthenticated: Boolean(callerUserId),
      callerUserId: callerUserId || null,
      attempted: tokens.length,
      delivered: results.filter((item) => item.ok).length,
      failed: results.filter((item) => !item.ok).length,
      results,
    });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
