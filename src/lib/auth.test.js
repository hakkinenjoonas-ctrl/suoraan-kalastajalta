import { describe, expect, it } from "vitest";
import { deduplicateAllowedUsers, isFutureJwtClockSkewError, isMissingRefreshTokenError } from "./auth.js";

describe("auth", () => {
  describe("isMissingRefreshTokenError", () => {
    it("detects invalid refresh token errors", () => {
      expect(isMissingRefreshTokenError(new Error("Invalid Refresh Token: Refresh Token Not Found"))).toBe(true);
    });

    it("detects refresh token not found text directly", () => {
      expect(isMissingRefreshTokenError("refresh token not found")).toBe(true);
    });

    it("ignores unrelated auth errors", () => {
      expect(isMissingRefreshTokenError(new Error("Email rate limit exceeded"))).toBe(false);
    });
  });

  describe("isFutureJwtClockSkewError", () => {
    it("detects the transient Supabase clock-skew message", () => {
      expect(isFutureJwtClockSkewError(new Error("JWT issued at future"))).toBe(true);
      expect(isFutureJwtClockSkewError("JWT issued in the future")).toBe(true);
    });

    it("does not classify ordinary authentication failures as clock skew", () => {
      expect(isFutureJwtClockSkewError("Invalid login credentials")).toBe(false);
    });
  });
});

describe("deduplicateAllowedUsers", () => {
  it("removes duplicate rows for the same normalized email, role and buyer", () => {
    const rows = [
      { id: "old", email: " Fisher@example.com ", role: "member", buyer_id: null, is_active: false },
      { id: "active", email: "fisher@example.com", role: "member", buyer_id: null, is_active: true },
    ];

    expect(deduplicateAllowedUsers(rows)).toEqual([rows[1]]);
  });

  it("preserves separate roles and separate buyer links", () => {
    const rows = [
      { id: "member", email: "user@example.com", role: "member", buyer_id: null, is_active: true },
      { id: "processor", email: "user@example.com", role: "processor", buyer_id: null, is_active: true },
      { id: "buyer-a", email: "user@example.com", role: "buyer", buyer_id: "a", is_active: true },
      { id: "buyer-b", email: "user@example.com", role: "buyer", buyer_id: "b", is_active: true },
    ];

    expect(deduplicateAllowedUsers(rows)).toEqual(rows);
  });
});
