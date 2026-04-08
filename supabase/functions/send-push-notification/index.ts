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
    const title = safeString(body.title);
    const messageBody = safeString(body.body);
    const eventType = safeString(body.eventType) || "general";
    const data = typeof body.data === "object" && body.data ? body.data : {};

    if (!title || !messageBody) {
      return jsonResponse(400, { error: "Missing title or body" });
    }
    if (!targetUserId && !targetBuyerId) {
      return jsonResponse(400, { error: "Missing target user or buyer id" });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    let tokenQuery = adminClient
      .from("app_push_tokens")
      .select("id, token, platform")
      .eq("is_active", true);

    if (targetUserId) {
      tokenQuery = tokenQuery.eq("user_id", targetUserId);
    } else {
      tokenQuery = tokenQuery.eq("buyer_id", targetBuyerId);
    }

    const { data: tokenRows, error: tokenError } = await tokenQuery;
    if (tokenError) {
      return jsonResponse(500, { error: tokenError.message });
    }

    const tokens = Array.from(new Set((tokenRows || []).map((row) => safeString(row.token)).filter(Boolean)));
    if (tokens.length === 0) {
      return jsonResponse(200, { ok: true, skipped: true, reason: "no_tokens" });
    }

    if (!projectId) {
      return jsonResponse(200, { ok: true, skipped: true, reason: "missing_fcm_project_id", tokens: tokens.length });
    }

    const accessToken = await getGoogleAccessToken();
    if (!accessToken) {
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
                channel_id: "trade_events_waterdrop",
                sound: "waterdrop",
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
