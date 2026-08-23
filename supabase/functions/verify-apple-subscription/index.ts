import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const BUNDLE_ID = "fi.suoraankalastajalta.app";
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

function decodeBase64UrlJson(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return JSON.parse(atob(padded));
}

function decodeJwsPayload(jws: string) {
  const parts = jws.split(".");
  if (parts.length !== 3) throw new Error("Invalid signed transaction");
  return decodeBase64UrlJson(parts[1]) as Record<string, unknown>;
}

function pemToBytes(pem: string) {
  const encoded = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(encoded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function createAppleAuthorizationToken() {
  const issuerId = safeString(Deno.env.get("APPLE_IAP_ISSUER_ID"));
  const keyId = safeString(Deno.env.get("APPLE_IAP_KEY_ID"));
  const privateKeyPem = safeString(Deno.env.get("APPLE_IAP_PRIVATE_KEY"));
  if (!issuerId || !keyId || !privateKeyPem) {
    throw new Error("Apple billing service environment variables are missing");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: issuerId,
    iat: now,
    exp: now + 300,
    aud: "appstoreconnect-v1",
    bid: BUNDLE_ID,
  }));
  const unsignedToken = `${header}.${claims}`;
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(privateKeyPem),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(unsignedToken),
  );
  return `${unsignedToken}.${base64Url(new Uint8Array(signature))}`;
}

async function fetchVerifiedTransaction(transactionId: string, authorization: string) {
  const environments = [
    { name: "Production", baseUrl: "https://api.storekit.apple.com" },
    { name: "Sandbox", baseUrl: "https://api.storekit-sandbox.apple.com" },
  ];
  for (const environment of environments) {
    const response = await fetch(
      `${environment.baseUrl}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`,
      { headers: { Authorization: `Bearer ${authorization}` } },
    );
    const payload = await response.json().catch(() => ({}));
    if (response.ok && safeString(payload.signedTransactionInfo)) {
      return {
        environment: environment.name,
        signedTransactionInfo: safeString(payload.signedTransactionInfo),
        transaction: decodeJwsPayload(safeString(payload.signedTransactionInfo)),
      };
    }
    if (response.status !== 404) {
      console.error("verify-apple-subscription:apple-error", environment.name, payload);
      throw new Error("App Store -tilauksen tarkistus epäonnistui");
    }
  }
  throw new Error("App Store -tapahtumaa ei löytynyt");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  try {
    const supabaseUrl = safeString(Deno.env.get("SUPABASE_URL"));
    const anonKey = safeString(Deno.env.get("SUPABASE_ANON_KEY"));
    const serviceRoleKey = safeString(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    const authHeader = req.headers.get("Authorization") || "";
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse(500, { error: "Billing service environment variables are missing" });
    }
    if (!authHeader) return jsonResponse(401, { error: "Missing authorization" });

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser();
    const userId = safeString(authData?.user?.id).toLowerCase();
    if (authError || !userId) return jsonResponse(401, { error: "Invalid authorization" });

    const body = await req.json().catch(() => ({}));
    const transactionId = safeString(body.transactionId);
    const signedTransactionInfo = safeString(body.signedTransactionInfo);
    const productId = safeString(body.productId);
    if (!transactionId || !signedTransactionInfo || productId !== PREMIUM_PRODUCT_ID) {
      return jsonResponse(400, { error: "Invalid Premium purchase" });
    }

    const clientTransaction = decodeJwsPayload(signedTransactionInfo);
    if (safeString(clientTransaction.transactionId) !== transactionId) {
      return jsonResponse(400, { error: "Transaction identifier does not match receipt" });
    }

    const authorization = await createAppleAuthorizationToken();
    const verified = await fetchVerifiedTransaction(transactionId, authorization);
    const transaction = verified.transaction;
    const verifiedProductId = safeString(transaction.productId);
    const bundleId = safeString(transaction.bundleId);
    const originalTransactionId = safeString(transaction.originalTransactionId);
    const appAccountToken = safeString(transaction.appAccountToken).toLowerCase();
    const expiresDateMs = Number(transaction.expiresDate || 0);
    const revocationDateMs = Number(transaction.revocationDate || 0);
    if (
      verifiedProductId !== PREMIUM_PRODUCT_ID
      || bundleId !== BUNDLE_ID
      || safeString(transaction.transactionId) !== transactionId
      || !originalTransactionId
    ) {
      return jsonResponse(400, { error: "Verified transaction does not contain Fisher Premium" });
    }
    if (!appAccountToken || appAccountToken !== userId) {
      return jsonResponse(409, { error: "App Store purchase belongs to another application account" });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: existingOwner } = await adminClient
      .from("profiles")
      .select("id")
      .eq("apple_subscription_original_transaction_id", originalTransactionId)
      .neq("id", userId)
      .maybeSingle();
    if (existingOwner) return jsonResponse(409, { error: "Purchase is already linked to another user" });

    const entitled = expiresDateMs > Date.now() && !revocationDateMs;
    const expiresAt = expiresDateMs ? new Date(expiresDateMs).toISOString() : null;
    const update = {
      fisher_premium_enabled: entitled,
      apple_subscription_status: entitled ? "ACTIVE" : revocationDateMs ? "REVOKED" : "EXPIRED",
      apple_subscription_product_id: PREMIUM_PRODUCT_ID,
      apple_subscription_transaction_id: transactionId,
      apple_subscription_original_transaction_id: originalTransactionId,
      apple_subscription_expires_at: expiresAt,
      apple_subscription_environment: safeString(transaction.environment) || verified.environment,
      apple_subscription_verified_at: new Date().toISOString(),
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
    console.error("verify-apple-subscription:unexpected", error);
    return jsonResponse(500, {
      error: safeString(error instanceof Error ? error.message : error) || "Unexpected error",
    });
  }
});
