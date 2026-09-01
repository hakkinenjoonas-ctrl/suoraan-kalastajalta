export function getRequestedPublicBatchId() {
  if (typeof window === "undefined") return "";
  const pathname = String(window.location.pathname || "");
  if (pathname.startsWith("/batch/")) {
    return decodeURIComponent(pathname.slice("/batch/".length)).trim();
  }
  const params = new URLSearchParams(window.location.search);
  if (!params.get("offer") && params.get("batch")) {
    return String(params.get("batch") || "").trim();
  }
  return "";
}

export function getRequestedOfferId() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return String(params.get("offer") || "").trim();
}

export function leavePublicBatchView() {
  if (typeof window === "undefined") return;
  window.history.replaceState({}, "", "/");
}

export function applyIncomingAppUrl(urlString, handlers = {}) {
  if (typeof window === "undefined" || !urlString) return;

  let parsedUrl = null;
  try {
    parsedUrl = new URL(urlString);
  } catch {
    return;
  }

  const currentUrl = new URL(window.location.href);
  const nextPath = `${parsedUrl.pathname || "/"}${parsedUrl.search || ""}${parsedUrl.hash || ""}`;
  const currentPath = `${currentUrl.pathname || "/"}${currentUrl.search || ""}${currentUrl.hash || ""}`;
  if (nextPath !== currentPath) {
    window.history.replaceState({}, "", nextPath);
  }

  const nextParams = new URLSearchParams(parsedUrl.search || "");
  const linkedOfferId = String(nextParams.get("offer") || "").trim();
  const batchPathMatch = String(parsedUrl.pathname || "").match(/^\/batch\/(.+)$/);
  const linkedBatchId = batchPathMatch ? decodeURIComponent(String(batchPathMatch[1] || "")).trim() : String(nextParams.get("batch") || "").trim();

  if (linkedOfferId) {
    handlers.setBuyerActiveOfferId?.(linkedOfferId);
    handlers.setActiveTab?.("offers");
  } else if (linkedBatchId) {
    handlers.setPublicBatchId?.(linkedBatchId);
  }
}
