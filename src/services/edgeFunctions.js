import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../lib/supabase.js";

export function getPublicBatchInfoUrl(batchId) {
  if (!batchId) return "";
  return `${SUPABASE_URL}/functions/v1/public-batch-info?batchId=${encodeURIComponent(batchId)}`;
}

export async function invokeEdgeFunctionAuthenticated(functionName, body, accessToken) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      data,
      error: {
        message: data?.error || `HTTP ${response.status}`,
        status: response.status,
        context: data,
      },
    };
  }

  return { data, error: null };
}

export async function fetchBuyerReport(accessToken) {
  return invokeEdgeFunctionAuthenticated("buyer-report", {}, accessToken);
}

export async function invokeBuyerOfferAction(accessToken, payload) {
  return invokeEdgeFunctionAuthenticated("buyer-offer-action", payload, accessToken);
}

export async function invokeBulkOfferDispatch(accessToken, payload) {
  return invokeEdgeFunctionAuthenticated("bulk-send-offers", payload, accessToken);
}
