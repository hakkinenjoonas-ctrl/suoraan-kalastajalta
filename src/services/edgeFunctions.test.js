import { afterEach, describe, expect, it, vi } from "vitest";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../lib/supabase.js";
import {
  invokeBulkOfferDispatch,
  invokeEdgeFunctionAuthenticated,
} from "./edgeFunctions.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("authenticated edge functions", () => {
  it("dispatches buyer offers to the established bulk endpoint with authentication", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ sent: 3 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const payload = { offerId: "offer-1", buyerIds: ["buyer-1", "buyer-2"] };
    const result = await invokeBulkOfferDispatch("access-token", payload);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `${SUPABASE_URL}/functions/v1/bulk-send-offers`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: "Bearer access-token",
        }),
        body: JSON.stringify(payload),
      }),
    );
    expect(result).toEqual({ data: { sent: 3 }, error: null });
  });

  it("returns a structured error without throwing when the endpoint rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({ error: "dispatch failed" }),
    }));

    const result = await invokeEdgeFunctionAuthenticated("bulk-send-offers", {}, "access-token");

    expect(result.data).toEqual({ error: "dispatch failed" });
    expect(result.error).toMatchObject({ message: "dispatch failed", status: 500 });
  });

  it("normalizes network failures for the UI", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Failed to fetch")));

    const result = await invokeBulkOfferDispatch("access-token", { offerId: "offer-1" });

    expect(result.data).toBeNull();
    expect(result.error).toMatchObject({
      status: 0,
      message: "Yhteys palvelimeen epäonnistui. Tarkista verkkoyhteys ja yritä uudelleen.",
    });
  });
});
