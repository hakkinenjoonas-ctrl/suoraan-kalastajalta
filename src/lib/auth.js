import { supabase } from "./supabase.js";
import { normalizeEmail } from "./ui.js";

export function isMissingRefreshTokenError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("invalid refresh token") || message.includes("refresh token not found");
}

export async function clearBrokenSession() {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // ignore
  }

  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.includes("supabase")) keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch {
    // ignore
  }
}

export async function findAllowedUsersByEmail(supabaseClient, email) {
  const normalized = normalizeEmail(email);
  const { data, error } = await supabaseClient
    .from("allowed_users")
    .select("*")
    .ilike("email", normalized);

  if (error) return { data: [], error };

  const matches = (data || []).filter((row) => normalizeEmail(row.email) === normalized);
  return { data: matches, error: null };
}

export async function findAllowedUserByEmail(supabaseClient, email) {
  const { data, error } = await findAllowedUsersByEmail(supabaseClient, email);
  return { data: (data || [])[0] || null, error };
}

export function deduplicateAllowedUsers(rows = []) {
  const deduplicated = new Map();

  for (const row of rows || []) {
    const key = [
      normalizeEmail(row?.email),
      String(row?.role || ""),
      String(row?.buyer_id || ""),
    ].join("::");
    const existing = deduplicated.get(key);

    // Prefer the active row if old duplicate data contains mixed states.
    if (!existing || (!existing.is_active && row?.is_active)) {
      deduplicated.set(key, row);
    }
  }

  return [...deduplicated.values()];
}
