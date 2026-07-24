import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../lib/supabase.js";

function formatEdgeFunctionNetworkError(error) {
  const message = String(error?.message || error || "").trim();
  const normalizedMessage = message.toLowerCase();
  if (
    normalizedMessage.includes("failed to fetch") ||
    normalizedMessage.includes("network request failed") ||
    normalizedMessage.includes("networkerror when attempting to fetch resource") ||
    normalizedMessage.includes("upstream connect error") ||
    normalizedMessage.includes("disconnect/reset before headers") ||
    normalizedMessage.includes("connection termination")
  ) {
    return "Yhteys palvelimeen epäonnistui. Tarkista verkkoyhteys ja yritä uudelleen.";
  }
  return message || "Yhteys palvelimeen epäonnistui.";
}

export function getPublicBatchInfoUrl(batchId) {
  if (!batchId) return "";
  return `${SUPABASE_URL}/functions/v1/public-batch-info?batchId=${encodeURIComponent(batchId)}`;
}

export async function invokeEdgeFunctionAuthenticated(functionName, body, accessToken) {
  let response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_PUBLISHABLE_KEY,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    return {
      data: null,
      error: {
        message: formatEdgeFunctionNetworkError(error),
        status: 0,
        context: error,
      },
    };
  }

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

export async function invokeAdminDeleteEntity(accessToken, payload) {
  return invokeEdgeFunctionAuthenticated("admin-delete-entity", payload, accessToken);
}

export async function verifyGooglePlaySubscription(accessToken, payload) {
  return invokeEdgeFunctionAuthenticated("verify-google-play-subscription", payload, accessToken);
}
