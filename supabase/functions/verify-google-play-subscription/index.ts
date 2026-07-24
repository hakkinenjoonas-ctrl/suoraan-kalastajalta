import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const PACKAGE_NAME = "fi.suoraankalastajalta.app";
const PREMIUM_PRODUCT_ID = "fisher_premium_monthly";

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeString(value: unknown) {
  return String(value || "").trim();
}

function base64Url(value: Uint8Array | string) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToBytes(pem: string) {
  const encoded = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(encoded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function getGoogleAccessToken(serviceAccount: Record<string, unknown>) {
  const clientEmail = safeString(serviceAccount.client_email);
  const privateKeyPem = safeString(serviceAccount.private_key);
  if (!clientEmail || !privateKeyPem) throw new Error("Google Play service account is incomplete");

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsignedToken = `${header}.${claims}`;
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsignedToken),
  );
  const assertion = `${unsignedToken}.${base64Url(new Uint8Array(signature))}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !safeString(payload.access_token)) {
    throw new Error(safeString(payload.error_description || payload.error) || "Google authentication failed");
  }
  return safeString(payload.access_token);
}

function subscriptionIsEntitled(subscriptionState: string, expiryTime: string) {
  const entitledStates = new Set([
    "SUBSCRIPTION_STATE_ACTIVE",
    "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
    "SUBSCRIPTION_STATE_CANCELED",
  ]);
  return entitledStates.has(subscriptionState) && Date.parse(expiryTime) > Date.now();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  try {
    const supabaseUrl = safeString(Deno.env.get("SUPABASE_URL"));
    const anonKey = safeString(Deno.env.get("SUPABASE_ANON_KEY"));
    const serviceRoleKey = safeString(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    const serviceAccountRaw = safeString(Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"));
    const existingServiceAccountEmail = safeString(Deno.env.get("FCM_CLIENT_EMAIL"));
    const existingServiceAccountPrivateKey = safeString(Deno.env.get("FCM_PRIVATE_KEY"));
    const authHeader = req.headers.get("Authorization") || "";
    if (
      !supabaseUrl
      || !anonKey
      || !serviceRoleKey
      || (!serviceAccountRaw && (!existingServiceAccountEmail || !existingServiceAccountPrivateKey))
    ) {
      return jsonResponse(500, { error: "Billing service environment variables are missing" });
    }
    if (!authHeader) return jsonResponse(401, { error: "Missing authorization" });

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser();
    const userId = safeString(authData?.user?.id);
    if (authError || !userId) return jsonResponse(401, { error: "Invalid authorization" });

    const body = await req.json().catch(() => ({}));
    const purchaseToken = safeString(body.purchaseToken);
    const productId = safeString(body.productId);
    if (!purchaseToken || productId !== PREMIUM_PRODUCT_ID) {
      return jsonResponse(400, { error: "Invalid Premium purchase" });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: existingOwner } = await adminClient
      .from("profiles")
      .select("id")
      .eq("google_play_subscription_purchase_token", purchaseToken)
      .neq("id", userId)
      .maybeSingle();
    if (existingOwner) return jsonResponse(409, { error: "Purchase is already linked to another user" });

    const serviceAccount = serviceAccountRaw
      ? JSON.parse(serviceAccountRaw) as Record<string, unknown>
      : {
          client_email: existingServiceAccountEmail,
          private_key: existingServiceAccountPrivateKey,
        };
    const accessToken = await getGoogleAccessToken(serviceAccount);
    const subscriptionUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
    const subscriptionResponse = await fetch(subscriptionUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const subscription = await subscriptionResponse.json().catch(() => ({}));
    if (!subscriptionResponse.ok) {
      console.error("verify-google-play-subscription:google-error", subscription);
      return jsonResponse(502, { error: "Google Play -tilauksen tarkistus epäonnistui" });
    }

    const matchingLineItem = (subscription.lineItems || []).find((item: Record<string, unknown>) => (
      safeString(item.productId) === PREMIUM_PRODUCT_ID
    ));
    if (!matchingLineItem) return jsonResponse(400, { error: "Purchase does not contain the Premium product" });

    const subscriptionState = safeString(subscription.subscriptionState);
    const expiryTime = safeString(matchingLineItem.expiryTime);
    const entitled = subscriptionIsEntitled(subscriptionState, expiryTime);
    const acknowledgementState = safeString(subscription.acknowledgementState);

    if (acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING") {
      const acknowledgeUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/subscriptions/${PREMIUM_PRODUCT_ID}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
      const acknowledgeResponse = await fetch(acknowledgeUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: "{}",
      });
      if (!acknowledgeResponse.ok) {
        console.error("verify-google-play-subscription:acknowledge-error", await acknowledgeResponse.text());
        return jsonResponse(502, { error: "Google Play -ostoksen kuittaus epäonnistui" });
      }
    }

    const update = {
      fisher_premium_enabled: entitled,
      google_play_subscription_status: subscriptionState || null,
      google_play_subscription_product_id: PREMIUM_PRODUCT_ID,
      google_play_subscription_purchase_token: purchaseToken,
      google_play_subscription_order_id: safeString(subscription.latestOrderId) || null,
      google_play_subscription_expires_at: expiryTime || null,
      google_play_subscription_verified_at: new Date().toISOString(),
    };
    const { data: profile, error: updateError } = await adminClient
      .from("profiles")
      .update(update)
      .eq("id", userId)
      .select("*")
      .single();
    if (updateError) return jsonResponse(500, { error: updateError.message });

    return jsonResponse(200, { ok: true, entitled, profile });
  } catch (error) {
    console.error("verify-google-play-subscription:unexpected", error);
    return jsonResponse(500, { error: safeString(error instanceof Error ? error.message : error) || "Unexpected error" });
  }
});
