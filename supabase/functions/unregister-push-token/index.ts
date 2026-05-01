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
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    let query = adminClient
      .from("app_push_tokens")
      .update({ is_active: false })
      .eq("user_id", callerUserId)
      .eq("is_active", true);

    if (token) {
      query = query.eq("token", token);
    }

    const { error } = await query;
    if (error) {
      return jsonResponse(500, { error: error.message });
    }

    console.log("unregister-push-token:ok", {
      callerUserId,
      tokenProvided: Boolean(token),
    });

    return jsonResponse(200, {
      ok: true,
      userId: callerUserId,
      tokenProvided: Boolean(token),
    });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
