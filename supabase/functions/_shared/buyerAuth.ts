import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

import { jsonResponse, safeString } from "./http.ts";

function uniqueNonEmpty(values: unknown[]) {
  return Array.from(
    new Set(
      values
        .map((value) => safeString(value).toLowerCase())
        .filter(Boolean),
    ),
  );
}

export async function resolveBuyerRecord(
  adminClient: ReturnType<typeof createClient>,
  profile: Record<string, unknown>,
) {
  const existingBuyerId = safeString(profile?.buyer_id);

  if (existingBuyerId) {
    const { data, error } = await adminClient
      .from("buyers")
      .select("*")
      .eq("id", existingBuyerId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (data) return data;
  }

  const candidateEmails = uniqueNonEmpty([
    profile?.email,
    profile?.contact_email,
    profile?.billing_email,
  ]);

  for (const candidateEmail of candidateEmails) {
    const { data, error } = await adminClient
      .from("buyers")
      .select("*")
      .or(`email.eq.${candidateEmail},billing_email.eq.${candidateEmail}`)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("buyer-auth:buyer-lookup-error", {
        email: candidateEmail,
        error: error.message,
      });
      continue;
    }

    if (data) return data;
  }

  return null;
}

export async function requireAuthenticatedProfileContext(req: Request) {
  const supabaseUrl = safeString(Deno.env.get("SUPABASE_URL"));
  const anonKey = safeString(Deno.env.get("SUPABASE_ANON_KEY"));
  const serviceRoleKey = safeString(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return {
      ok: false as const,
      response: jsonResponse(500, { error: "Supabase environment variables missing" }),
    };
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader) {
    return {
      ok: false as const,
      response: jsonResponse(401, { error: "Missing authorization" }),
    };
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
    return {
      ok: false as const,
      response: jsonResponse(401, { error: "Invalid authorization" }),
    };
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, role, buyer_id, email, contact_email, billing_email, display_name, company_name")
    .eq("id", callerUserId)
    .maybeSingle();

  if (profileError || !profile) {
    return {
      ok: false as const,
      response: jsonResponse(404, { error: profileError?.message || "Profile not found" }),
    };
  }

  return {
    ok: true as const,
    adminClient,
    callerUserId,
    profile,
  };
}

export async function requireBuyerContext(req: Request) {
  const authContext = await requireAuthenticatedProfileContext(req);
  if (!authContext.ok) return authContext;

  try {
    const buyer = await resolveBuyerRecord(authContext.adminClient, authContext.profile as Record<string, unknown>);
    if (!buyer) {
      return {
        ok: false as const,
        response: jsonResponse(403, { error: "Buyer profile not linked to this user" }),
      };
    }

    return {
      ok: true as const,
      adminClient: authContext.adminClient,
      callerUserId: authContext.callerUserId,
      profile: authContext.profile,
      buyer,
    };
  } catch (error) {
    return {
      ok: false as const,
      response: jsonResponse(500, {
        error: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}
