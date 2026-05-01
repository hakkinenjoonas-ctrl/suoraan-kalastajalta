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

async function resolveBuyerId(adminClient: ReturnType<typeof createClient>, profile: Record<string, unknown>, explicitBuyerId: string) {
  if (explicitBuyerId) return explicitBuyerId;

  const existingBuyerId = safeString(profile?.buyer_id);
  if (existingBuyerId) return existingBuyerId;

  const candidateEmails = Array.from(new Set([
    safeString(profile?.email).toLowerCase(),
    safeString(profile?.contact_email).toLowerCase(),
    safeString(profile?.billing_email).toLowerCase(),
  ].filter(Boolean)));

  for (const candidateEmail of candidateEmails) {
    const { data, error } = await adminClient
      .from("buyers")
      .select("id")
      .or(`email.eq.${candidateEmail},billing_email.eq.${candidateEmail}`)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("register-push-token:buyer-lookup-error", {
        email: candidateEmail,
        error: error.message,
      });
      continue;
    }

    const buyerId = safeString(data?.id);
    if (buyerId) return buyerId;
  }

  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = safeString(Deno.env.get("SUPABASE_URL"));
    const anonKey = safeString(Deno.env.get("SUPABASE_ANON_KEY"));
    const serviceRoleKey = safeString(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse(500, { error: "Supabase environment variables missing" });
    }

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) {
      return jsonResponse(401, { error: "Missing authorization" });
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser();
    const callerUserId = safeString(authData?.user?.id);

    if (authError || !callerUserId) {
      return jsonResponse(401, { error: "Invalid authorization" });
    }

    const body = await req.json().catch(() => ({}));
    const token = safeString(body.token);
    const platform = safeString(body.platform) || "android";
    const deviceLabel = safeString(body.deviceLabel) || "android-app";
    const explicitBuyerId = safeString(body.buyerId);

    if (!token) {
      return jsonResponse(400, { error: "Missing token" });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, role, buyer_id, email, contact_email, billing_email")
      .eq("id", callerUserId)
      .maybeSingle();

    if (profileError || !profile) {
      return jsonResponse(500, { error: profileError?.message || "Profile not found" });
    }

    const role = safeString(profile.role) || "member";
    const resolvedBuyerId = role === "buyer"
      ? await resolveBuyerId(adminClient, profile as Record<string, unknown>, explicitBuyerId)
      : "";

    if (role === "buyer" && resolvedBuyerId && safeString(profile.buyer_id) !== resolvedBuyerId) {
      const { error: updateProfileError } = await adminClient
        .from("profiles")
        .update({ buyer_id: resolvedBuyerId })
        .eq("id", callerUserId);

      if (updateProfileError) {
        console.error("register-push-token:profile-buyer-update-error", {
          callerUserId,
          resolvedBuyerId,
          error: updateProfileError.message,
        });
      }
    }

    const { error: upsertError } = await adminClient
      .from("app_push_tokens")
      .upsert({
        user_id: callerUserId,
        buyer_id: resolvedBuyerId || null,
        role,
        platform,
        token,
        device_label: deviceLabel,
        is_active: true,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: "token" });

    if (upsertError) {
      return jsonResponse(500, { error: upsertError.message });
    }

    console.log("register-push-token:ok", {
      callerUserId,
      buyerId: resolvedBuyerId || null,
      role,
      platform,
      deviceLabel,
    });

    return jsonResponse(200, {
      ok: true,
      userId: callerUserId,
      buyerId: resolvedBuyerId || null,
      role,
      platform,
    });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
